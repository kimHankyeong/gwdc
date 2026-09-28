import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";
import { createApp, type AppOptions } from "./server.js";
import { openDb } from "./db.js";

async function setup(options: Pick<AppOptions, "queueLimit"> = {}) {
  const db = openDb(":memory:");
  const env = { DEMO_MODE: "true", ALLOW_DEMO_PROVIDER: "true", CHAIN_PROVIDER: "simulated", SESSION_SECRET: randomBytes(32).toString("hex"), HOST: "127.0.0.1" };
  const runtime = createApp({ env, db, workRoot: await mkdtemp(path.join(tmpdir(), "purchase-server-test-")), ...options });
  await runtime.app.ready();
  await runtime.start();
  const cookieFor = async (userId: string) => {
    const response = await runtime.app.inject({ method: "POST", url: "/api/session", headers: { origin: "http://127.0.0.1:4174", host: "127.0.0.1:4174" }, payload: { userId } });
    assert.equal(response.statusCode, 200, response.body);
    const header = response.headers["set-cookie"];
    assert.ok(header);
    return (Array.isArray(header) ? header[0]! : header).split(";")[0]!;
  };
  const send = (cookie: string, method: string, url: string, payload?: unknown) => runtime.app.inject({
    method, url, ...(payload === undefined ? {} : { payload }),
    headers: { cookie, origin: "http://127.0.0.1:4174", host: "127.0.0.1:4174" },
  });
  return { ...runtime, cookieFor, send, async close() { await runtime.app.close(); db.close(); } };
}

test("demo sessions are signed, and cross-site writes are rejected", async () => {
  const runtime = await setup();
  try {
    const noSession = await runtime.app.inject({ method: "GET", url: "/api/bootstrap" });
    assert.equal(noSession.statusCode, 200);
    assert.equal(JSON.parse(noSession.body).user, null);
    const branchCookie = await runtime.cookieFor("branch-01");
    const session = await runtime.send(branchCookie, "GET", "/api/session");
    assert.equal(JSON.parse(session.body).user.id, "branch-01");
    const forged = await runtime.send("session=branch-01%7C9999999999999.bad", "GET", "/api/policies");
    assert.equal(forged.statusCode, 401);
    const csrf = await runtime.app.inject({ method: "POST", url: "/api/session", headers: { origin: "https://attacker.example", host: "127.0.0.1:4174" }, payload: { userId: "hq" } });
    assert.equal(csrf.statusCode, 403);
  } finally { await runtime.close(); }
});

test("HQ controls branch policies; branches cannot change budgets", async () => {
  const runtime = await setup();
  try {
    const branch = await runtime.cookieFor("branch-01");
    const denied = await runtime.send(branch, "PUT", "/api/policies", { branchId: "branch-01", budget: 500_000, supplierIds: ["market-one"], expiresAt: "2030-01-01T00:00:00Z" });
    assert.equal(denied.statusCode, 403);
    const hq = await runtime.cookieFor("hq");
    const approved = await runtime.send(hq, "PUT", "/api/policies", { branchId: "branch-01", budget: 100_000, supplierIds: ["market-one"], expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    assert.equal(approved.statusCode, 200, approved.body);
    const policy = JSON.parse(approved.body).policy;
    assert.equal(policy.version, 2);
    assert.deepEqual(policy.supplierIds, ["market-one"]);
  } finally { await runtime.close(); }
});

test("orders are queued, idempotent, priced from the catalogue, and export simulation receipts", async () => {
  const runtime = await setup();
  try {
    const branch = await runtime.cookieFor("branch-01");
    const payload = { branchId: "branch-01", idempotencyKey: "unit-test-onions-01", provider: "demo", needs: [{ itemId: "onion", quantity: 3 }] };
    const accepted = await runtime.send(branch, "POST", "/api/orders", payload);
    assert.equal(accepted.statusCode, 202, accepted.body);
    const id = JSON.parse(accepted.body).purchase.id as string;
    const repeated = await runtime.send(branch, "POST", "/api/orders", payload);
    assert.equal(repeated.statusCode, 200);
    assert.equal(JSON.parse(repeated.body).purchase.id, id);
    const conflict = await runtime.send(branch, "POST", "/api/orders", { ...payload, needs: [{ itemId: "onion", quantity: 4 }] });
    assert.equal(conflict.statusCode, 409);
    await runtime.queue.waitForIdle();
    const detail = await runtime.send(branch, "GET", `/api/orders/${id}`);
    const purchase = JSON.parse(detail.body).purchase;
    assert.equal(purchase.status, "paid_simulated");
    assert.equal(purchase.subtotal, 5_400);
    assert.equal(purchase.deliveryFee, 2_000);
    assert.equal(purchase.total, 7_400);
    assert.equal(purchase.txHash, null);
    assert.equal(purchase.tokenUsage.total, null);
    const receipt = await runtime.send(branch, "GET", `/api/orders/${id}/receipt`);
    const exported = JSON.parse(receipt.body);
    assert.equal(exported.chainEvidence.txHash, null);
    assert.equal(exported.policy.version, 1);
  } finally { await runtime.close(); }
});

test("fee-inclusive overruns and stopped-agent runs are recorded without payment", async () => {
  const runtime = await setup();
  try {
    const branch = await runtime.cookieFor("branch-02");
    const over = await runtime.send(branch, "POST", "/api/orders", { branchId: "branch-02", idempotencyKey: "unit-test-over-budget-01", provider: "demo", needs: [{ itemId: "chicken", quantity: 25 }] });
    assert.equal(over.statusCode, 202);
    await runtime.queue.waitForIdle();
    const overPurchase = JSON.parse(over.body).purchase;
    const overDetail = JSON.parse((await runtime.send(branch, "GET", `/api/orders/${overPurchase.id}`)).body).purchase;
    assert.equal(overDetail.status, "blocked");
    assert.match(overDetail.error, /배송비/);
    assert.equal(overDetail.txHash, null);

    const hq = await runtime.cookieFor("hq");
    const stop = await runtime.send(hq, "POST", "/api/policies/branch-02/stop");
    assert.equal(stop.statusCode, 200);
    const afterStop = await runtime.send(branch, "POST", "/api/orders", { branchId: "branch-02", idempotencyKey: "unit-test-after-stop-01", provider: "demo", needs: [{ itemId: "onion", quantity: 1 }] });
    assert.equal(afterStop.statusCode, 202);
    await runtime.queue.waitForIdle();
    const stoppedPurchase = JSON.parse(afterStop.body).purchase;
    const stoppedDetail = JSON.parse((await runtime.send(branch, "GET", `/api/orders/${stoppedPurchase.id}`)).body).purchase;
    assert.equal(stoppedDetail.status, "blocked");
    assert.match(stoppedDetail.error, /중단/);
    assert.equal(stoppedDetail.txHash, null);
  } finally { await runtime.close(); }
});

test("branches cannot read or place orders against another branch", async () => {
  const runtime = await setup();
  try {
    const branch = await runtime.cookieFor("branch-01");
    const policy = await runtime.send(branch, "GET", "/api/policies");
    assert.deepEqual(JSON.parse(policy.body).policies.map((item: { branchId: string }) => item.branchId), ["branch-01"]);
    const crossBranch = await runtime.send(branch, "POST", "/api/orders", { branchId: "branch-02", idempotencyKey: "cross-branch-0001", provider: "demo", needs: [{ itemId: "onion", quantity: 1 }] });
    assert.equal(crossBranch.statusCode, 403);
  } finally { await runtime.close(); }
});
