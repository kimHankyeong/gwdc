import { z } from "zod";

export const DEMO_USERS = [
  { id: "hq", displayName: "본사 운영팀", role: "HQ" as const, branchId: null },
  { id: "branch-01", displayName: "강남 1호점", role: "BRANCH" as const, branchId: "branch-01" },
  { id: "branch-02", displayName: "성수 2호점", role: "BRANCH" as const, branchId: "branch-02" },
];

export const SUPPLIERS = [
  { id: "fresh-first", name: "새벽식자재", deliveryFee: 2_000 },
  { id: "market-one", name: "한결푸드", deliveryFee: 4_000 },
];

export const CATALOG = [
  { id: "chicken", name: "닭다리살", unit: "kg", price: 8_900 },
  { id: "onion", name: "양파", unit: "kg", price: 1_800 },
  { id: "lettuce", name: "양상추", unit: "박스", price: 12_000 },
  { id: "rice", name: "쌀", unit: "포 20kg", price: 54_000 },
  { id: "oil", name: "식용유", unit: "말통", price: 38_000 },
];

const idSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/i);
const moneySchema = z.number().int().safe().nonnegative().max(1_000_000_000_000);

export const createPolicySchema = z.object({
  branchId: idSchema,
  budget: moneySchema.positive(),
  supplierIds: z.array(idSchema).min(1).max(20),
  expiresAt: z.iso.datetime({ offset: true }),
}).strict();

export const purchaseRequestSchema = z.object({
  branchId: idSchema,
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[\w.:-]+$/),
  needs: z.array(z.object({ itemId: idSchema, quantity: z.number().int().positive().max(10_000) }).strict()).min(1).max(20),
  provider: z.enum(["codex", "claude", "demo"]),
}).strict();

export const purchasePlanSchema = z.object({
  supplierId: idSchema,
  items: z.array(z.object({ itemId: idSchema, quantity: z.number().int().positive().max(10_000) }).strict()).min(1).max(20),
  rationale: z.string().trim().min(5).max(500),
}).strict();

export type DemoUser = (typeof DEMO_USERS)[number];
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
export type PurchasePlan = z.infer<typeof purchasePlanSchema>;

export type Policy = {
  branchId: string;
  budget: number;
  spent: number;
  supplierIds: string[];
  expiresAt: string;
  version: number;
  active: boolean;
};

export type PurchaseStatus = "queued" | "planning" | "awaiting_chain" | "paid_simulated" | "paid_onchain" | "blocked" | "failed";

export type PurchaseRecord = {
  id: string;
  branchId: string;
  status: PurchaseStatus;
  provider: string;
  items: PurchasePlan["items"];
  supplierId?: string;
  rationale?: string;
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  policyVersion?: number;
  policySnapshot?: Policy;
  txHash: string | null;
  chainMode: "simulated" | "rpc";
  gasUsed?: string;
  gasCostWei?: string;
  detailsHash?: string;
  tokenUsage?: { input: number | null; output: number | null; total: number | null };
  durationMs?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: number;
  purchaseId: string | null;
  branchId: string | null;
  actorId: string;
  type: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};
