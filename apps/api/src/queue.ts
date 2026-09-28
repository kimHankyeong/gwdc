import { createHash } from "node:crypto";
import { toUtf8Bytes, keccak256 } from "ethers";
import { CATALOG, DEMO_USERS, SUPPLIERS, type Policy, type PurchasePlan, type PurchaseRecord } from "@franchise/shared";
import { generatePurchasePlan, PolicyViolation, type AgentResult } from "./agent.js";
import type { Db } from "./db.js";
import type { ChainPort, Settlement } from "./chain.js";
import { addAudit, chargePolicy, getPolicy, getPurchase, listPolicies, markPurchase, nextQueued, readPurchaseRequest, recoverInterrupted } from "./store.js";

const supplierById = new Map(SUPPLIERS.map((supplier) => [supplier.id, supplier]));
const itemById = new Map(CATALOG.map((item) => [item.id, item]));
const stableJson = (value: unknown) => JSON.stringify(value);

export function quoteFor(plan: PurchasePlan) {
  const supplier = supplierById.get(plan.supplierId);
  if (!supplier) throw new PolicyViolation("등록되지 않은 공급업체입니다.");
  let subtotal = 0;
  const seen = new Map<string, number>();
  for (const line of plan.items) {
    const item = itemById.get(line.itemId);
    if (!item) throw new PolicyViolation("등록되지 않은 품목이 포함되어 있습니다.");
    seen.set(line.itemId, (seen.get(line.itemId) ?? 0) + line.quantity);
    const amount = item.price * line.quantity;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(subtotal + amount)) throw new PolicyViolation("발주 금액이 지원 한도를 벗어났습니다.");
    subtotal += amount;
  }
  return { subtotal, deliveryFee: supplier.deliveryFee, total: subtotal + supplier.deliveryFee, supplierName: supplier.name, lines: plan.items.map((line) => ({ ...line, name: itemById.get(line.itemId)!.name, unit: itemById.get(line.itemId)!.unit, unitPrice: itemById.get(line.itemId)!.price })) };
}

function makeDetailsHash(purchaseId: string, policy: Policy, plan: PurchasePlan, quote: ReturnType<typeof quoteFor>): string {
  const details = {
    purchaseId, branchId: policy.branchId, policy: { version: policy.version, budget: policy.budget, spentBeforeOrder: policy.spent, supplierIds: [...policy.supplierIds].sort(), expiresAt: policy.expiresAt },
    supplierId: plan.supplierId,
    items: quote.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.unitPrice * line.quantity })).sort((a, b) => a.itemId.localeCompare(b.itemId)),
    subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total,
  };
  return keccak256(toUtf8Bytes(stableJson(details)));
}

export type QueueConfig = { cliBin: string; cliTimeoutMs: number; cliMaxOutputBytes: number; workRoot: string; maxQueued: number; allowDemoProvider: boolean };
export type QueueResult = { accepted: boolean; queueDepth: number };

export class PurchaseQueue {
  private active: Promise<void> | null = null;
  private idleWaiters: Array<() => void> = [];

  constructor(private readonly db: Db, private readonly chain: ChainPort, private readonly config: QueueConfig) {}

  start(): void {
    recoverInterrupted(this.db);
    this.notify();
  }

  notify(): void {
    if (this.active) return;
    this.active = this.drain().finally(() => {
      this.active = null;
      if (this.pendingCount() > 0) this.notify();
      else this.idleWaiters.splice(0).forEach((resolve) => resolve());
    });
  }

  pendingCount(): number {
    return (this.db.prepare("SELECT count(*) AS total FROM purchases WHERE status IN ('queued','planning','awaiting_chain')").get() as { total: number }).total;
  }

  enqueueCountAfterSubmit(): QueueResult {
    const depth = this.pendingCount();
    if (depth > this.config.maxQueued) return { accepted: false, queueDepth: depth };
    this.notify();
    return { accepted: true, queueDepth: depth };
  }

  async waitForIdle(timeoutMs = 15_000): Promise<void> {
    if (!this.active && this.pendingCount() === 0) return;
    await Promise.race([new Promise<void>((resolve) => this.idleWaiters.push(resolve)), new Promise<void>((_, reject) => setTimeout(() => reject(new Error("큐가 제한 시간 안에 비워지지 않았습니다.")), timeoutMs))]);
  }

  private async drain(): Promise<void> {
    while (true) {
      const purchase = nextQueued(this.db);
      if (!purchase) return;
      await this.process(purchase);
    }
  }

  private async process(starting: PurchaseRecord): Promise<void> {
    let purchase = getPurchase(this.db, starting.id)!;
    try {
      if (purchase.chainMode !== this.chain.mode) throw new Error("발주가 생성된 체인 모드와 현재 체인 모드가 다릅니다.");
      const request = readPurchaseRequest(this.db, purchase.id);
      let plan: PurchasePlan;
      let policy: Policy;
      let quote: ReturnType<typeof quoteFor>;
      let agentResult: AgentResult | null = null;

      if (purchase.status === "awaiting_chain" && purchase.policySnapshot && purchase.supplierId && purchase.total !== undefined) {
        policy = purchase.policySnapshot;
        plan = { supplierId: purchase.supplierId, items: purchase.items, rationale: purchase.rationale ?? "복구된 발주안" };
        const checked = quoteFor(plan);
        quote = { ...checked, subtotal: purchase.subtotal ?? checked.subtotal, deliveryFee: purchase.deliveryFee ?? checked.deliveryFee, total: purchase.total };
      } else {
        markPurchase(this.db, purchase.id, "planning");
        addAudit(this.db, `branch:${purchase.branchId}`, "purchase.planning", "발주 조건과 승인 정책을 확인합니다.", purchase.branchId, purchase.id, { provider: request.provider });
        policy = getPolicy(this.db, purchase.branchId)!;
        if (!policy) throw new PolicyViolation("본사 승인 정책을 찾을 수 없습니다.");
        if (purchase.provider === "demo" && !this.config.allowDemoProvider) throw new Error("데모 응답 사용은 ALLOW_DEMO_PROVIDER=true인 경우에만 허용됩니다.");
        agentResult = await generatePurchasePlan(request.provider, request, { policy, suppliers: SUPPLIERS, catalog: CATALOG }, {
          bin: request.provider === "codex" ? this.config.cliBin : process.env.CLAUDE_BIN ?? "claude",
          timeoutMs: this.config.cliTimeoutMs, maxOutputBytes: this.config.cliMaxOutputBytes, workRoot: this.config.workRoot,
        });
        plan = agentResult.plan;
        const currentPolicy = getPolicy(this.db, purchase.branchId);
        if (!currentPolicy || currentPolicy.version !== policy.version || !currentPolicy.active) throw new PolicyViolation("발주 준비 중 본사 정책이 변경되거나 중단되어 실행하지 않았습니다.");
        policy = currentPolicy;
        quote = quoteFor(plan);
        if (quote.total > policy.budget - policy.spent) throw new PolicyViolation("배송비를 포함하면 승인 잔액을 초과합니다.");
        const detailsHash = makeDetailsHash(purchase.id, policy, plan, quote);
        const savedQuote = { subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total, durationMs: agentResult.durationMs };
        markPurchase(this.db, purchase.id, this.chain.mode === "rpc" ? "awaiting_chain" : "planning", { plan, quote: savedQuote, policySnapshot: policy, policyVersion: policy.version, detailsHash, tokenUsage: agentResult.usage });
        addAudit(this.db, `branch:${purchase.branchId}`, "purchase.validated", "품목 가격과 배송비를 서버 카탈로그로 다시 계산했습니다.", purchase.branchId, purchase.id, { policyVersion: policy.version, subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total, detailsHash, provider: agentResult.provider, usage: agentResult.usage, durationMs: agentResult.durationMs });
      }

      const currentPolicy = getPolicy(this.db, purchase.branchId);
      if (!currentPolicy?.active || Date.parse(currentPolicy.expiresAt) <= Date.now()) throw new PolicyViolation("본사 승인이 만료되었거나 중단되었습니다.");
      if (currentPolicy.version !== policy.version) throw new PolicyViolation("발주 검토 중 정책 버전이 바뀌었습니다.");
      if (quote.total > currentPolicy.budget - currentPolicy.spent) throw new PolicyViolation("배송비를 포함하면 승인 잔액을 초과합니다.");

      const current = getPurchase(this.db, purchase.id)!;
      const detailsHash = current.detailsHash ?? makeDetailsHash(purchase.id, policy, plan, quote);
      if (this.chain.mode === "rpc") {
        markPurchase(this.db, purchase.id, "awaiting_chain", { plan, quote: { subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total, ...(agentResult ? { durationMs: agentResult.durationMs } : {}), ...(current.gasUsed ? { gasUsed: current.gasUsed } : {}), ...(current.gasCostWei ? { gasCostWei: current.gasCostWei } : {}) }, policySnapshot: policy, policyVersion: policy.version, detailsHash, ...(current.txHash ? { txHash: current.txHash } : {}), ...(agentResult ? { tokenUsage: agentResult.usage } : {}) });
        const settlement = await this.chain.settle(purchase.id, purchase.branchId, plan, quote, detailsHash, (hash) => markPurchase(this.db, purchase.id, "awaiting_chain", { txHash: hash }), current.txHash ?? undefined);
        if (!settlement) throw new Error("RPC 결제 연결이 활성화되지 않았습니다.");
        this.finishPurchase(purchase, quote, policy, plan, "paid_onchain", settlement, agentResult);
      } else {
        this.finishPurchase(purchase, quote, policy, plan, "paid_simulated", null, agentResult);
      }
    } catch (error) {
      purchase = getPurchase(this.db, starting.id) ?? starting;
      if (["paid_simulated", "paid_onchain"].includes(purchase.status)) return;
      const message = error instanceof Error ? error.message.slice(0, 400) : "처리 중 알 수 없는 오류가 발생했습니다.";
      const blocked = error instanceof PolicyViolation || (error && typeof error === "object" && "name" in error && error.name === "ZodError");
      const status = blocked ? "blocked" : "failed";
      const txn = this.db.transaction(() => {
        markPurchase(this.db, purchase.id, status, { error: message });
        addAudit(this.db, `branch:${purchase.branchId}`, `purchase.${status}`, message, purchase.branchId, purchase.id, { provider: purchase.provider });
      });
      txn.immediate();
    }
  }

  private finishPurchase(starting: PurchaseRecord, quote: ReturnType<typeof quoteFor>, policy: Policy, plan: PurchasePlan, status: "paid_simulated" | "paid_onchain", settlement: Settlement | null, result: AgentResult | null): void {
    const quoteData = { subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total, ...(result ? { durationMs: result.durationMs } : {}), ...(settlement ? { gasUsed: settlement.gasUsed, gasCostWei: settlement.gasCostWei } : {}) };
    const commit = this.db.transaction(() => {
      chargePolicy(this.db, starting.branchId, quote.total);
      markPurchase(this.db, starting.id, status, { plan, quote: quoteData, ...(settlement ? { txHash: settlement.txHash } : {}), policyVersion: policy.version, ...(result ? { tokenUsage: result.usage } : {}) });
      addAudit(this.db, `branch:${starting.branchId}`, `purchase.${status}`, status === "paid_onchain" ? "승인 범위 안에서 온체인 결제가 완료되었습니다." : "시뮬레이션 모드에서 승인 범위 안의 결제를 기록했습니다.", starting.branchId, starting.id, { supplierId: plan.supplierId, subtotal: quote.subtotal, deliveryFee: quote.deliveryFee, total: quote.total, policyVersion: policy.version, txHash: settlement?.txHash ?? null, detailsHash: getPurchase(this.db, starting.id)?.detailsHash ?? null, gasUsed: settlement?.gasUsed ?? null, gasCostWei: settlement?.gasCostWei ?? null });
    });
    commit.immediate();
  }
}
