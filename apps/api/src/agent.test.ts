import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Policy, PurchasePlan, PurchaseRequest, SUPPLIERS, CATALOG } from "@franchise/shared";
import { generatePurchasePlan, parseClaude, parseCodex, PolicyViolation, validatePlanScope } from "./agent.js";

const request: PurchaseRequest = { branchId: "branch-01", idempotencyKey: "agent-test-0001", provider: "demo", needs: [{ itemId: "chicken", quantity: 1 }] };
const context = (budget = 20_000, active = true, approved = ["fresh-first"]): { policy: Policy; suppliers: typeof SUPPLIERS; catalog: typeof CATALOG } => ({
  policy: { branchId: "branch-01", budget, spent: 0, supplierIds: approved, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), version: 1, active },
  suppliers: SUPPLIERS, catalog: CATALOG,
});

test("demo adapter returns a plan without claiming token usage or a model call", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "purchase-agent-test-"));
  const result = await generatePurchasePlan("demo", request, context(), { bin: "codex", timeoutMs: 1000, maxOutputBytes: 1024, workRoot: root });
  assert.equal(result.plan.supplierId, "fresh-first");
  assert.deepEqual(result.usage, { input: null, output: null, total: null });
  assert.equal(result.provider, "demo");
});

test("an unavailable CLI fails closed before any payment path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "purchase-agent-missing-cli-"));
  await assert.rejects(generatePurchasePlan("claude", { ...request, provider: "claude" }, context(), {
    bin: path.join(root, "claude-does-not-exist"), timeoutMs: 1_000, maxOutputBytes: 1_024, workRoot: root,
  }));
});

test("server denies over-budget plans including the delivery fee", () => {
  const plan: PurchasePlan = { supplierId: "fresh-first", items: [{ itemId: "chicken", quantity: 1 }], rationale: "지점 요청 수량을 주문합니다." };
  assert.throws(() => validatePlanScope(plan, request, context(10_899)), PolicyViolation);
  assert.doesNotThrow(() => validatePlanScope(plan, request, context(10_900)));
});

test("server blocks an unapproved supplier, expired policy, and oversupply", () => {
  const approvedContext = context(100_000);
  assert.throws(() => validatePlanScope({ supplierId: "market-one", items: [{ itemId: "chicken", quantity: 1 }], rationale: "approved request" }, request, approvedContext), /허용하지 않은 공급업체/);
  const expired = context(100_000);
  expired.policy.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => validatePlanScope({ supplierId: "fresh-first", items: [{ itemId: "chicken", quantity: 1 }], rationale: "approved request" }, request, expired), /만료/);
  assert.throws(() => validatePlanScope({ supplierId: "fresh-first", items: [{ itemId: "chicken", quantity: 2 }], rationale: "approved request" }, request, approvedContext), /요청 수량을 초과/);
});

test("Codex JSONL and Claude JSON results preserve the model plan and usage", () => {
  const plan = { supplierId: "fresh-first", items: [{ itemId: "onion", quantity: 2 }], rationale: "본사 승인 공급처를 선택합니다." };
  const codex = parseCodex(`${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(plan) } })}\n${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 321, output_tokens: 54 } })}`);
  assert.deepEqual(codex.plan, plan);
  assert.deepEqual(codex.usage, { input: 321, output: 54, total: 375 });
  const claude = parseClaude(JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: plan, usage: { input_tokens: 123, output_tokens: 45 } }));
  assert.deepEqual(claude.plan, plan);
  assert.deepEqual(claude.usage, { input: 123, output: 45, total: 168 });
});
