import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG, DEMO_USERS, SUPPLIERS, createPolicySchema, purchaseRequestSchema, type DemoUser, type Policy } from "@franchise/shared";
import { openDb, type Db } from "./db.js";
import { rpcChain, simulatedChain, type ChainPort } from "./chain.js";
import { PurchaseQueue } from "./queue.js";
import { addAudit, getPolicy, getPurchase, listEvents, listPolicies, listPurchases, revokePolicy, seed, submitPurchase, upsertPolicy } from "./store.js";

declare module "fastify" {
  interface FastifyRequest { currentUser: DemoUser | null }
}

export type AppOptions = {
  env?: NodeJS.ProcessEnv;
  db?: Db;
  chain?: ChainPort;
  staticRoot?: string;
  workRoot?: string;
  queueLimit?: number;
  sessionSecret?: string;
};

const demoUser = (id: unknown) => DEMO_USERS.find((user) => user.id === id) ?? null;
const utcNow = () => new Date().toISOString();
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

export function createApp(options: AppOptions = {}) {
  const env = options.env ?? process.env;
  const databasePath = env.DATABASE_PATH || path.resolve(process.cwd(), "apps/api/data/procurement.sqlite");
  const db = options.db ?? openDb(databasePath);
  seed(db);
  const chain = options.chain ?? (env.CHAIN_PROVIDER === "rpc" ? rpcChain(env) : simulatedChain());
  const demoMode = env.DEMO_MODE !== "false";
  const secret = options.sessionSecret ?? (env.SESSION_SECRET || randomBytes(32).toString("hex"));
  if (secret.length < 32) throw new Error("SESSION_SECRET에는 최소 32자의 비밀값이 필요합니다.");

  const app = Fastify({
    logger: { level: env.LOG_LEVEL || "info", redact: ["req.headers.cookie", "req.headers.authorization", "headers.cookie", "headers.authorization"] },
    trustProxy: false,
    bodyLimit: 16_384,
    disableRequestLogging: false,
  });
  const queue = new PurchaseQueue(db, chain, {
    cliBin: env.CODEX_BIN || "codex",
    cliTimeoutMs: Number.parseInt(env.CLI_TIMEOUT_MS || "45000", 10),
    cliMaxOutputBytes: Number.parseInt(env.CLI_MAX_OUTPUT_BYTES || "131072", 10),
    allowDemoProvider: env.ALLOW_DEMO_PROVIDER === "true",
    workRoot: options.workRoot ?? path.resolve(process.cwd(), "apps/api/.work"),
    maxQueued: options.queueLimit ?? 100,
  });

  app.decorateRequest("currentUser", null);
  app.register(cookie, { secret });
  app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", "data:"], styleSrc: ["'self'", "'unsafe-inline'"], fontSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } });

  app.addHook("onRequest", async (request, reply) => {
    const signed = request.cookies.session;
    if (!signed) return;
    const result = request.unsignCookie(signed);
    if (!result.valid || !result.value) return;
    const [id, expiresText, extra] = result.value.split("|");
    const user = demoUser(id);
    const expiresAt = Number(expiresText);
    if (!user || extra !== undefined || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return;
    request.currentUser = user;
  });

  app.addHook("onRequest", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    if (!request.url.startsWith("/api/")) return;
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (typeof origin !== "string" || typeof host !== "string") return reply.code(403).send({ error: "요청 출처를 확인할 수 없습니다." });
    let originHost = "";
    let originHostname = "";
    try { const parsedOrigin = new URL(origin); originHost = parsedOrigin.host; originHostname = parsedOrigin.hostname; } catch { return reply.code(403).send({ error: "요청 출처가 올바르지 않습니다." }); }
    if (!["127.0.0.1", "localhost", "[::1]"].includes(originHostname.toLowerCase())) return reply.code(403).send({ error: "로컬 데모에서만 쓸 수 있습니다." });
    if (originHost.toLowerCase() !== host.toLowerCase()) return reply.code(403).send({ error: "허용되지 않은 요청 출처입니다." });
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/api/session" || request.url === "/api/health" || request.url === "/api/bootstrap") return;
    if (!request.url.startsWith("/api/")) return;
    if (!request.currentUser) return reply.code(401).send({ error: "먼저 데모 계정으로 로그인하세요." });
  });

  const api = app.withTypeProvider();
  api.get("/api/health", async () => ({ status: "ok", chainMode: chain.mode, queueDepth: queue.pendingCount(), demoMode }));

  api.post<{ Body: { userId?: string } }>("/api/session", async (request, reply) => {
    if (!demoMode) return reply.code(404).send({ error: "로컬 데모 로그인이 비활성화되어 있습니다." });
    const user = demoUser(request.body?.userId);
    if (!user) return reply.code(400).send({ error: "등록되지 않은 데모 계정입니다." });
    const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
    reply.setCookie("session", `${user.id}|${expiresAt}`, { signed: true, httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 12 * 60 * 60 });
    addAudit(db, user, "session.started", `${user.displayName} 계정으로 로그인했습니다.`, user.branchId);
    return reply.send({ user });
  });

  api.delete("/api/session", async (request, reply) => {
    reply.clearCookie("session", { path: "/", sameSite: "strict" });
    if (request.currentUser) addAudit(db, request.currentUser, "session.ended", "로그아웃했습니다.", request.currentUser.branchId);
    return { ok: true };
  });

  api.get("/api/session", async (request) => ({ user: request.currentUser, demoMode, chainMode: chain.mode }));
  api.get("/api/catalog", async () => ({ sandbox: true, currency: "DKRW", notice: "모든 가격은 데모용 예시입니다.", suppliers: SUPPLIERS, items: CATALOG }));

  api.get("/api/policies", async (request) => {
    const user = request.currentUser!;
    return { policies: user.role === "HQ" ? listPolicies(db) : [getPolicy(db, user.branchId!)].filter((policy): policy is Policy => !!policy) };
  });

  api.put<{ Body: unknown }>("/api/policies", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role !== "HQ") return reply.code(403).send({ error: "본사 담당자만 지출 정책을 승인할 수 있습니다." });
    const parsed = createPolicySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "정책 입력을 확인하세요.", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    if (!DEMO_USERS.some((candidate) => candidate.role === "BRANCH" && candidate.branchId === parsed.data.branchId)) return reply.code(400).send({ error: "등록된 가맹점이 아닙니다." });
    const unknownSupplier = parsed.data.supplierIds.find((id) => !SUPPLIERS.some((supplier) => supplier.id === id));
    if (unknownSupplier) return reply.code(400).send({ error: `등록되지 않은 공급업체입니다: ${unknownSupplier}` });
    const previous = getPolicy(db, parsed.data.branchId);
    const candidate: Policy = { branchId: parsed.data.branchId, budget: parsed.data.budget, spent: previous?.spent ?? 0, supplierIds: [...new Set(parsed.data.supplierIds)].sort(), expiresAt: new Date(parsed.data.expiresAt).toISOString(), version: (previous?.version ?? 0) + 1, active: true };
    const chainTx = await chain.approvePolicy(candidate);
    const policy = upsertPolicy(db, user, parsed.data);
    if (chainTx) addAudit(db, user, "policy.onchain", "승인 정책이 프라이빗 체인에 확정되었습니다.", policy.branchId, null, { txHash: chainTx, version: policy.version });
    return reply.code(200).send({ policy, chainMode: chain.mode, txHash: chainTx, message: chainTx ? "온체인 정책 승인을 확인했습니다." : "시뮬레이션 모드에서 정책을 승인했습니다." });
  });

  api.post<{ Params: { branchId: string } }>("/api/policies/:branchId/stop", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role !== "HQ") return reply.code(403).send({ error: "본사 담당자만 에이전트를 중단할 수 있습니다." });
    const previous = getPolicy(db, request.params.branchId);
    if (!previous) return reply.code(404).send({ error: "지출 정책을 찾을 수 없습니다." });
    if (!previous.active) return { policy: previous, chainMode: chain.mode, txHash: null };
    const txHash = await chain.stopPolicy(previous.branchId);
    const policy = revokePolicy(db, user, previous.branchId)!;
    if (txHash) addAudit(db, user, "policy.stop-confirmed", "에이전트 중단이 프라이빗 체인에서 확정되었습니다.", policy.branchId, null, { txHash, version: policy.version });
    return { policy, chainMode: chain.mode, txHash, status: txHash ? "confirmed" : "simulated" };
  });

  api.get("/api/orders", async (request) => {
    const user = request.currentUser!;
    return { orders: listPurchases(db, user.role === "HQ" ? undefined : user.branchId!) };
  });

  api.post<{ Body: unknown }>("/api/orders", async (request, reply) => {
    const user = request.currentUser!;
    const parsed = purchaseRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "발주 입력을 확인하세요.", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    if (user.role !== "BRANCH" || parsed.data.branchId !== user.branchId) return reply.code(403).send({ error: "로그인한 가맹점의 발주만 요청할 수 있습니다." });
    const policy = getPolicy(db, parsed.data.branchId);
    if (!policy) return reply.code(409).send({ error: "본사가 승인한 정책이 없습니다." });
    const queueDepth = queue.pendingCount();
    if (queueDepth >= 100) return reply.code(503).send({ error: "발주 대기열이 가득 찼습니다. 잠시 후 다시 시도하세요.", retryAfterSeconds: 5 });
    if (parsed.data.provider === "demo" && env.ALLOW_DEMO_PROVIDER !== "true") return reply.code(403).send({ error: "데모 발주안은 ALLOW_DEMO_PROVIDER=true인 경우에만 허용됩니다." });
    const result = submitPurchase(db, user, parsed.data, chain.mode);
    if ("conflict" in result) return reply.code(409).send({ error: "같은 멱등성 키에 다른 발주 요청이 있습니다." });
    queue.enqueueCountAfterSubmit();
    return reply.code(result.created ? 202 : 200).send({ purchase: result.purchase, queueDepth: queue.pendingCount(), idempotentReplay: !result.created });
  });

  api.get<{ Params: { id: string } }>("/api/orders/:id", async (request, reply) => {
    const user = request.currentUser!;
    const purchase = getPurchase(db, request.params.id);
    if (!purchase) return reply.code(404).send({ error: "발주 내역을 찾을 수 없습니다." });
    if (user.role !== "HQ" && user.branchId !== purchase.branchId) return reply.code(404).send({ error: "발주 내역을 찾을 수 없습니다." });
    return { purchase };
  });

  api.get<{ Params: { id: string } }>("/api/orders/:id/receipt", async (request, reply) => {
    const user = request.currentUser!;
    const purchase = getPurchase(db, request.params.id);
    if (!purchase) return reply.code(404).send({ error: "영수증을 찾을 수 없습니다." });
    if (user.role !== "HQ" && user.branchId !== purchase.branchId) return reply.code(404).send({ error: "영수증을 찾을 수 없습니다." });
    const catalog = new Map(CATALOG.map((item) => [item.id, item]));
    const receipt = {
      recordType: "franchise-wholesale-simulation-receipt/v1", mode: purchase.chainMode,
      purchase, request: JSON.parse((db.prepare("SELECT request_json FROM purchases WHERE id=?").get(purchase.id) as { request_json: string }).request_json),
      supplier: SUPPLIERS.find((supplier) => supplier.id === purchase.supplierId) ?? null,
      items: purchase.items.map((line) => ({ ...line, ...catalog.get(line.itemId) })),
      policy: purchase.policySnapshot ?? null, audit: listEvents(db, user.role === "HQ" ? undefined : user.branchId!, purchase.id),
      chainEvidence: purchase.chainMode === "rpc" ? { txHash: purchase.txHash, detailsHash: purchase.detailsHash, note: "별도 도구에서 온체인 이벤트와 대조하세요." } : { txHash: null, note: "시뮬레이션 모드이며 온체인 결제는 발생하지 않았습니다." },
      exportedAt: utcNow(),
    };
    reply.header("content-type", "application/json; charset=utf-8").header("content-disposition", `attachment; filename=receipt-${purchase.id}.json`);
    return receipt;
  });

  api.get<{ Querystring: { branchId?: string; purchaseId?: string } }>("/api/audit", async (request, reply) => {
    const user = request.currentUser!;
    if (user.role === "BRANCH" && request.query.branchId && request.query.branchId !== user.branchId) return reply.code(404).send({ error: "기록을 찾을 수 없습니다." });
    return { events: listEvents(db, user.role === "HQ" ? request.query.branchId : user.branchId!, request.query.purchaseId) };
  });

  api.get("/api/bootstrap", async (request) => {
    const user = request.currentUser;
    return {
      user, demoMode, chainMode: chain.mode,
      defaultProvider: env.LLM_PROVIDER === "claude" ? "claude" : env.LLM_PROVIDER === "demo" ? "demo" : "codex",
      ...(user ? {
        policies: user.role === "HQ" ? listPolicies(db) : [getPolicy(db, user.branchId!)].filter((policy): policy is Policy => !!policy),
        orders: listPurchases(db, user.role === "HQ" ? undefined : user.branchId!).slice(0, 20),
        events: listEvents(db, user.role === "HQ" ? undefined : user.branchId!).slice(0, 50),
      } : {}),
      users: DEMO_USERS.map(({ id, displayName, role, branchId }) => ({ id, displayName, role, branchId })),
      catalog: CATALOG, suppliers: SUPPLIERS,
    };
  });

  const staticRoot = options.staticRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(staticRoot)) {
    app.register(fastifyStatic, { root: staticRoot, prefix: "/", wildcard: false, decorateReply: true, index: ["index.html"] });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "API 경로를 찾을 수 없습니다." });
      return reply.sendFile("index.html");
    });
  }

  app.addHook("onClose", async () => { if (!options.db) db.close(); });
  return { app, db, chain, queue, demoMode, async start() { await chain.ready(); queue.start(); } };
}

const allowedHost = (host: string) => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host.toLowerCase());

export function listenHost(env: NodeJS.ProcessEnv): string {
  const host = env.HOST || "127.0.0.1";
  if (env.DEMO_MODE !== "false" && !allowedHost(host)) throw new Error("데모 로그인은 로컬 loopback 주소에서만 허용됩니다.");
  return host;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtime = createApp();
  await runtime.start();
  const port = Number.parseInt(process.env.PORT || "4174", 10);
  try {
    await runtime.app.listen({ host: listenHost(process.env), port });
  } catch (error) {
    runtime.app.log.error(error);
    process.exitCode = 1;
  }
}
