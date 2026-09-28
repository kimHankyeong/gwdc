import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { purchasePlanSchema, type Policy, type PurchasePlan, type PurchaseRequest } from "@franchise/shared";

export type Usage = { input: number | null; output: number | null; total: number | null };
export type AgentResult = { plan: PurchasePlan; usage: Usage; durationMs: number; provider: "codex" | "claude" | "demo" };
export type AgentContext = { policy: Policy; suppliers: Array<{ id: string; name: string; deliveryFee: number }>; catalog: Array<{ id: string; name: string; unit: string; price: number }> };
export class PolicyViolation extends Error {}

const schema = {
  type: "object", additionalProperties: false,
  required: ["supplierId", "items", "rationale"],
  properties: {
    supplierId: { type: "string" },
    items: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["itemId", "quantity"], properties: { itemId: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 10000 } } } },
    rationale: { type: "string", minLength: 5, maxLength: 500 },
  },
} as const;

function safeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const allowed = ["PATH", "PATHEXT", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "CODEX_HOME", "TERM", "LANG", "LC_ALL", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "OPENAI_API_KEY", "OPENAI_BASE_URL"];
  for (const key of allowed) if (process.env[key]) env[key] = process.env[key];
  return env;
}

function makePrompt(request: PurchaseRequest, context: AgentContext): string {
  const needed = request.needs.map((need) => ({ ...need, item: context.catalog.find((item) => item.id === need.itemId) }));
  return [
    "You prepare a food-wholesale purchase plan for a franchise branch.",
    "Return only the JSON object required by the supplied schema. Never perform a payment or claim it has been paid.",
    "Only choose requested products and quantities no greater than requested. Do not invent products, prices, suppliers, balances, or approvals.",
    "Supplier approval and amount limits are checked again after you respond. Explain the choice briefly in Korean.",
    JSON.stringify({ branchNeeds: needed, approvedSuppliers: context.policy.supplierIds, suppliers: context.suppliers, catalog: context.catalog, budgetRemainingKrw: Math.max(0, context.policy.budget - context.policy.spent), validUntil: context.policy.expiresAt }),
  ].join("\n\n");
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("CLI 응답에서 JSON 발주안을 찾지 못했습니다.");
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

function demoPlan(request: PurchaseRequest, context: AgentContext): PurchasePlan {
  const selected = context.suppliers.filter((supplier) => context.policy.supplierIds.includes(supplier.id)).sort((a, b) => a.deliveryFee - b.deliveryFee || a.id.localeCompare(b.id))[0];
  if (!selected) throw new Error("승인된 공급업체가 없습니다.");
  return { supplierId: selected.id, items: request.needs.map((need) => ({ itemId: need.itemId, quantity: need.quantity })), rationale: `${selected.name}은 본사 승인 목록에 있습니다. 배송비까지 서버가 다시 계산합니다. 데모 발주안입니다.` };
}

export function parseCodex(stdout: string): { plan: unknown; usage: Usage } {
  const events = stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; } });
  let message = "";
  let usage: Usage = { input: null, output: null, total: null };
  for (const event of events) {
    const item = event.item as Record<string, unknown> | undefined;
    if (event.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") message = item.text;
    if (event.type === "turn.completed" && event.usage && typeof event.usage === "object") {
      const raw = event.usage as Record<string, unknown>;
      const input = typeof raw.input_tokens === "number" ? raw.input_tokens : null;
      const output = typeof raw.output_tokens === "number" ? raw.output_tokens : null;
      usage = { input, output, total: input === null || output === null ? null : input + output };
    }
  }
  if (!message && events.length === 0) message = stdout;
  return { plan: parseJsonObject(message), usage };
}

export function parseClaude(stdout: string): { plan: unknown; usage: Usage } {
  const response = JSON.parse(stdout) as Record<string, unknown>;
  if (response.is_error === true || response.subtype !== "success") throw new Error("Claude CLI가 발주안을 생성하지 못했습니다.");
  const rawUsage = response.usage && typeof response.usage === "object" ? response.usage as Record<string, unknown> : {};
  const input = typeof rawUsage.input_tokens === "number" ? rawUsage.input_tokens : null;
  const output = typeof rawUsage.output_tokens === "number" ? rawUsage.output_tokens : null;
  return { plan: response.structured_output ?? (typeof response.result === "string" ? parseJsonObject(response.result) : response.result), usage: { input, output, total: input === null || output === null ? null : input + output } };
}

export function validatePlanScope(plan: PurchasePlan, request: PurchaseRequest, context: AgentContext): void {
  if (!context.policy.active) throw new PolicyViolation("본사가 에이전트를 중단했습니다.");
  if (Date.parse(context.policy.expiresAt) <= Date.now()) throw new PolicyViolation("본사 승인이 만료되었습니다.");
  if (!context.policy.supplierIds.includes(plan.supplierId)) throw new PolicyViolation("본사에서 허용하지 않은 공급업체입니다.");
  const supplier = context.suppliers.find((item) => item.id === plan.supplierId);
  if (!supplier) throw new PolicyViolation("등록되지 않은 공급업체입니다.");
  const requested = new Map<string, number>();
  for (const need of request.needs) requested.set(need.itemId, (requested.get(need.itemId) ?? 0) + need.quantity);
  const ordered = new Map<string, number>();
  for (const item of plan.items) {
    if (!context.catalog.some((catalogItem) => catalogItem.id === item.itemId)) throw new PolicyViolation("등록되지 않은 품목이 포함되어 있습니다.");
    ordered.set(item.itemId, (ordered.get(item.itemId) ?? 0) + item.quantity);
  }
  for (const [itemId, quantity] of ordered) if (!requested.has(itemId) || quantity > requested.get(itemId)!) throw new PolicyViolation("요청 수량을 초과하거나 요청에 없는 품목이 포함되어 있습니다.");
  if (plan.items.length === 0) throw new PolicyViolation("비어 있는 발주안입니다.");
  const total = plan.items.reduce((sum, orderItem) => {
    const catalogItem = context.catalog.find((item) => item.id === orderItem.itemId)!;
    return sum + catalogItem.price * orderItem.quantity;
  }, supplier.deliveryFee);
  if (!Number.isSafeInteger(total) || total > context.policy.budget - context.policy.spent) throw new PolicyViolation("배송비를 포함하면 승인 잔액을 초과합니다.");
}

export function pricingForPlan(plan: PurchasePlan, context: AgentContext): { subtotal: number; deliveryFee: number; total: number } {
  const supplier = context.suppliers.find((item) => item.id === plan.supplierId);
  if (!supplier) throw new PolicyViolation("등록되지 않은 공급업체입니다.");
  const subtotal = plan.items.reduce((sum, line) => {
    const item = context.catalog.find((candidate) => candidate.id === line.itemId);
    if (!item) throw new PolicyViolation("등록되지 않은 품목이 포함되어 있습니다.");
    return sum + item.price * line.quantity;
  }, 0);
  return { subtotal, deliveryFee: supplier.deliveryFee, total: subtotal + supplier.deliveryFee };
}

export async function generatePurchasePlan(provider: PurchaseRequest["provider"], request: PurchaseRequest, context: AgentContext, options: { bin: string; timeoutMs: number; maxOutputBytes: number; workRoot: string }): Promise<AgentResult> {
  const start = performance.now();
  if (provider === "demo") {
    const plan = purchasePlanSchema.parse(demoPlan(request, context));
    validatePlanScope(plan, request, context);
    return { plan, usage: { input: null, output: null, total: null }, durationMs: Math.round(performance.now() - start), provider };
  }

  const root = path.resolve(options.workRoot);
  await mkdir(root, { recursive: true });
  const workDir = await mkdtemp(path.join(root, `${provider}-`));
  const schemaPath = path.join(workDir, "purchase-plan.schema.json");
  try {
    await writeFile(schemaPath, JSON.stringify(schema), { encoding: "utf8", flag: "wx" });
    const prompt = makePrompt(request, context);
    let result: { plan: unknown; usage: Usage };
    if (provider === "codex") {
      const args = ["exec", "--json", "--output-schema", schemaPath, "--sandbox", "read-only", "--disable", "shell_tool", "--ephemeral", "--ignore-user-config", "--cd", workDir, "-"];
      const output = await execa(options.bin, args, { input: prompt, timeout: options.timeoutMs, maxBuffer: options.maxOutputBytes, reject: false, windowsHide: true, env: safeEnv(), cwd: workDir });
      if (output.failed) throw new Error(output.timedOut ? "Codex CLI 실행 시간이 초과되었습니다." : (output.message ?? "").slice(0, 300) || "Codex CLI 실행에 실패했습니다.");
      result = parseCodex(output.stdout);
    } else {
      const args = ["-p", "--output-format", "json", "--json-schema", JSON.stringify(schema), "--tools", "", "--disallowedTools", "mcp__*", "--no-session-persistence"];
      const output = await execa(options.bin, args, { input: prompt, timeout: options.timeoutMs, maxBuffer: options.maxOutputBytes, reject: false, windowsHide: true, env: safeEnv(), cwd: workDir });
      if (output.failed) throw new Error(output.timedOut ? "Claude CLI 실행 시간이 초과되었습니다." : (output.message ?? "").slice(0, 300) || "Claude CLI 실행에 실패했습니다.");
      result = parseClaude(output.stdout);
    }
    const plan = purchasePlanSchema.parse(result.plan);
    validatePlanScope(plan, request, context);
    return { plan, usage: result.usage, durationMs: Math.round(performance.now() - start), provider };
  } finally {
    const resolved = path.resolve(workDir);
    if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith(`${provider}-`)) throw new Error("CLI 작업 폴더 경로 검증에 실패했습니다.");
    await rm(resolved, { recursive: true, force: true });
  }
}
