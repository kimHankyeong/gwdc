import { randomUUID, createHash } from "node:crypto";
import type { AuditEvent, CreatePolicyInput, DemoUser, Policy, PurchaseRecord, PurchaseRequest, PurchaseStatus } from "@franchise/shared";
import type { Db } from "./db.js";

type PolicyRow = { branch_id: string; budget: number; spent: number; supplier_ids: string; expires_at: string; version: number; active: number };
type PurchaseRow = { id: string; branch_id: string; status: PurchaseStatus; provider: string; plan_json: string | null; quote_json: string | null; policy_json: string | null; details_hash: string | null; tx_hash: string | null; policy_version: number | null; token_usage_json: string | null; error: string | null; chain_mode: "simulated" | "rpc"; created_at: string; updated_at: string };
type EventRow = { id: number; purchase_id: string | null; branch_id: string | null; actor_id: string; type: string; message: string; metadata_json: string; created_at: string };

const now = () => new Date().toISOString();
const parse = <T>(json: string | null, fallback: T): T => json ? JSON.parse(json) as T : fallback;

export function addAudit(db: Db, actor: DemoUser | string, type: string, message: string, branchId: string | null, purchaseId: string | null = null, metadata: unknown = {}): void {
  db.prepare("INSERT INTO audit_events(purchase_id, branch_id, actor_id, type, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(purchaseId, branchId, typeof actor === "string" ? actor : actor.id, type, message, JSON.stringify(metadata), now());
}

export function seed(db: Db): void {
  const insert = db.prepare("INSERT OR IGNORE INTO policies(branch_id, budget, spent, supplier_ids, expires_at, version, active, updated_at) VALUES (?, ?, 0, ?, ?, 1, 1, ?)");
  const timestamp = now();
  insert.run("branch-01", 280_000, JSON.stringify(["fresh-first"]), "2030-01-01T00:00:00.000Z", timestamp);
  insert.run("branch-02", 220_000, JSON.stringify(["market-one"]), "2030-01-01T00:00:00.000Z", timestamp);
  if ((db.prepare("SELECT count(*) AS total FROM audit_events").get() as { total: number }).total === 0) {
    addAudit(db, "system", "bootstrap", "시뮬레이션 데이터가 준비되었습니다.", null, null, { sandbox: true });
  }
}

function toPolicy(row: PolicyRow | undefined): Policy | null {
  if (!row) return null;
  return { branchId: row.branch_id, budget: row.budget, spent: row.spent, supplierIds: parse<string[]>(row.supplier_ids, []), expiresAt: row.expires_at, version: row.version, active: row.active === 1 };
}

export function getPolicy(db: Db, branchId: string): Policy | null {
  return toPolicy(db.prepare("SELECT * FROM policies WHERE branch_id = ?").get(branchId) as PolicyRow | undefined);
}

export function listPolicies(db: Db): Policy[] {
  const rows = db.prepare("SELECT * FROM policies ORDER BY branch_id").all() as PolicyRow[];
  return rows.map((row) => toPolicy(row)!).filter(Boolean);
}

export function upsertPolicy(db: Db, actor: DemoUser, input: CreatePolicyInput): Policy {
  const previous = getPolicy(db, input.branchId);
  if (previous && input.budget < previous.spent) throw new Error("이미 사용한 금액보다 낮은 예산으로 정책을 변경할 수 없습니다.");
  const timestamp = now();
  const nextVersion = (previous?.version ?? 0) + 1;
  db.prepare(`INSERT INTO policies(branch_id, budget, spent, supplier_ids, expires_at, version, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(branch_id) DO UPDATE SET budget=excluded.budget, supplier_ids=excluded.supplier_ids,
      expires_at=excluded.expires_at, version=excluded.version, active=1, updated_at=excluded.updated_at`)
    .run(input.branchId, input.budget, previous?.spent ?? 0, JSON.stringify([...new Set(input.supplierIds)].sort()), input.expiresAt, nextVersion, timestamp);
  const result = getPolicy(db, input.branchId)!;
  addAudit(db, actor, "policy.approved", `${input.branchId} 지출 정책 v${nextVersion}이 승인되었습니다.`, input.branchId, null, { budget: input.budget, supplierIds: result.supplierIds, expiresAt: result.expiresAt, version: result.version });
  return result;
}

export function revokePolicy(db: Db, actor: DemoUser, branchId: string): Policy | null {
  const previous = getPolicy(db, branchId);
  if (!previous) return null;
  db.prepare("UPDATE policies SET active=0, version=version+1, updated_at=? WHERE branch_id=?").run(now(), branchId);
  const result = getPolicy(db, branchId)!;
  addAudit(db, actor, "policy.revoked", `${branchId} 에이전트의 중단 요청이 기록되었습니다.`, branchId, null, { version: result.version, chainMode: "simulated" });
  return result;
}

function toPurchase(row: PurchaseRow): PurchaseRecord {
  const quote = parse<{ subtotal: number; deliveryFee: number; total: number; durationMs?: number; gasUsed?: string; gasCostWei?: string } | null>(row.quote_json, null);
  const plan = parse<PurchaseRecord["items"] | null>(row.plan_json, null);
  const planFull = parse<{ supplierId: string; items: PurchaseRecord["items"]; rationale: string } | null>(row.plan_json, null);
  const usage = parse<PurchaseRecord["tokenUsage"] | null>(row.token_usage_json, null);
  return {
    id: row.id, branchId: row.branch_id, status: row.status, provider: row.provider,
    items: Array.isArray(plan) ? plan : planFull?.items ?? [],
    ...(planFull?.supplierId ? { supplierId: planFull.supplierId } : {}),
    ...(planFull?.rationale ? { rationale: planFull.rationale } : {}),
    ...(quote ? { subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total } : {}),
    ...(quote?.durationMs !== undefined ? { durationMs: quote.durationMs } : {}),
    ...(quote?.gasUsed !== undefined ? { gasUsed: quote.gasUsed } : {}),
    ...(quote?.gasCostWei !== undefined ? { gasCostWei: quote.gasCostWei } : {}),
    ...(row.policy_version ? { policyVersion: row.policy_version } : {}),
    txHash: row.tx_hash, chainMode: row.chain_mode,
    ...(row.policy_json ? { policySnapshot: JSON.parse(row.policy_json) as Policy } : {}),
    ...(row.details_hash ? { detailsHash: row.details_hash } : {}),
    ...(usage ? { tokenUsage: usage } : {}),
    ...(row.error ? { error: row.error } : {}), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const purchaseSelect = "SELECT p.* FROM purchases p";

export function getPurchase(db: Db, id: string): PurchaseRecord | null {
  const row = db.prepare(`${purchaseSelect} WHERE p.id = ?`).get(id) as PurchaseRow | undefined;
  return row ? toPurchase(row) : null;
}

export function listPurchases(db: Db, branchId?: string): PurchaseRecord[] {
  const rows = (branchId
    ? db.prepare(`${purchaseSelect} WHERE p.branch_id = ? ORDER BY p.created_at DESC LIMIT 100`).all(branchId)
    : db.prepare(`${purchaseSelect} ORDER BY p.created_at DESC LIMIT 100`).all()) as PurchaseRow[];
  return rows.map(toPurchase);
}

export type SubmitResult = { purchase: PurchaseRecord; created: boolean } | { conflict: true };

export function submitPurchase(db: Db, user: DemoUser, request: PurchaseRequest, chainMode: "simulated" | "rpc"): SubmitResult {
  const requestHash = createHash("sha256").update(JSON.stringify({ branchId: request.branchId, needs: [...request.needs].sort((a, b) => a.itemId.localeCompare(b.itemId)), provider: request.provider })).digest("hex");
  const existingRow = db.prepare("SELECT * FROM purchases WHERE branch_id=? AND idempotency_key=?").get(request.branchId, request.idempotencyKey) as PurchaseRow | undefined;
  if (existingRow) {
    const previous = db.prepare("SELECT request_hash FROM purchases WHERE id=?").get(existingRow.id) as { request_hash: string };
    return previous.request_hash === requestHash ? { purchase: toPurchase(existingRow), created: false } : { conflict: true };
  }

  const id = randomUUID();
  const timestamp = now();
  db.transaction(() => {
    db.prepare(`INSERT INTO purchases(id, branch_id, idempotency_key, request_hash, request_json, status, provider, chain_mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`)
      .run(id, request.branchId, request.idempotencyKey, requestHash, JSON.stringify(request), request.provider, chainMode, timestamp, timestamp);
    addAudit(db, user, "purchase.queued", "발주 실행이 접수되었습니다.", request.branchId, id, { provider: request.provider, chainMode });
  }).immediate();
  return { purchase: getPurchase(db, id)!, created: true };
}

export function markPurchase(db: Db, id: string, status: PurchaseStatus, fields: {
  plan?: unknown; quote?: unknown; policySnapshot?: Policy; policyVersion?: number; detailsHash?: string; txHash?: string;
  tokenUsage?: unknown; error?: string;
} = {}): void {
  const row = db.prepare("SELECT status FROM purchases WHERE id=?").get(id) as { status: PurchaseStatus } | undefined;
  if (!row) throw new Error("발주 건을 찾을 수 없습니다.");
  const columns: string[] = ["status=?", "updated_at=?"];
  const values: unknown[] = [status, now()];
  const add = (column: string, value: unknown) => { columns.push(`${column}=?`); values.push(value); };
  if (fields.plan !== undefined) add("plan_json", JSON.stringify(fields.plan));
  if (fields.quote !== undefined) add("quote_json", JSON.stringify(fields.quote));
  if (fields.policySnapshot !== undefined) add("policy_json", JSON.stringify(fields.policySnapshot));
  if (fields.policyVersion !== undefined) add("policy_version", fields.policyVersion);
  if (fields.detailsHash !== undefined) add("details_hash", fields.detailsHash);
  if (fields.txHash !== undefined) add("tx_hash", fields.txHash);
  if (fields.tokenUsage !== undefined) add("token_usage_json", JSON.stringify(fields.tokenUsage));
  if (fields.error !== undefined) add("error", fields.error.slice(0, 500));
  values.push(id);
  db.prepare(`UPDATE purchases SET ${columns.join(", ")} WHERE id=?`).run(...values);
}

export function chargePolicy(db: Db, branchId: string, amount: number): void {
  const result = db.prepare("UPDATE policies SET spent=spent+?, updated_at=? WHERE branch_id=? AND spent+?<=budget")
    .run(amount, now(), branchId, amount);
  if (result.changes !== 1) throw new Error("정책이 바뀌었거나 예산이 부족해 결제를 기록하지 못했습니다.");
}

export function listEvents(db: Db, branchId?: string, purchaseId?: string): AuditEvent[] {
  const predicates: string[] = [];
  const args: string[] = [];
  if (branchId) { predicates.push("branch_id=?"); args.push(branchId); }
  if (purchaseId) { predicates.push("purchase_id=?"); args.push(purchaseId); }
  const where = predicates.length ? ` WHERE ${predicates.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM audit_events${where} ORDER BY id DESC LIMIT 500`).all(...args) as EventRow[];
  return rows.map((row) => ({ id: row.id, purchaseId: row.purchase_id, branchId: row.branch_id, actorId: row.actor_id, type: row.type, message: row.message, metadata: JSON.parse(row.metadata_json), createdAt: row.created_at }));
}

export function nextQueued(db: Db): PurchaseRecord | null {
  const row = db.prepare("SELECT * FROM purchases WHERE status IN ('queued','awaiting_chain') ORDER BY created_at ASC LIMIT 1").get() as PurchaseRow | undefined;
  return row ? toPurchase(row) : null;
}

export function readPurchaseRequest(db: Db, id: string): PurchaseRequest {
  const row = db.prepare("SELECT request_json FROM purchases WHERE id=?").get(id) as { request_json: string } | undefined;
  if (!row) throw new Error("발주 요청 원문을 찾을 수 없습니다.");
  return JSON.parse(row.request_json) as PurchaseRequest;
}

export function recoverInterrupted(db: Db): number {
  const result = db.prepare("UPDATE purchases SET status='queued', updated_at=? WHERE status IN ('planning','awaiting_chain')").run(now());
  if (result.changes > 0) addAudit(db, "system", "purchase.recovered", `${result.changes}건의 중단된 작업을 큐에서 복구했습니다.`, null, null, { count: result.changes });
  return result.changes;
}
