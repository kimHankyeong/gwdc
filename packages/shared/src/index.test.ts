import assert from "node:assert/strict";
import test from "node:test";
import { createPolicySchema, purchasePlanSchema, purchaseRequestSchema } from "./index.js";

test("policy rejects negative and non-integer budgets", () => {
  const base = { branchId: "branch-01", supplierIds: ["fresh-first"], expiresAt: "2030-01-01T00:00:00Z" };
  assert.equal(createPolicySchema.safeParse({ ...base, budget: -1 }).success, false);
  assert.equal(createPolicySchema.safeParse({ ...base, budget: 3.5 }).success, false);
  assert.equal(createPolicySchema.safeParse({ ...base, budget: 100 }).success, true);
});

test("request and CLI plan schemas reject unknown fields and invalid quantities", () => {
  assert.equal(purchaseRequestSchema.safeParse({ branchId: "branch-01", idempotencyKey: "key-0001", provider: "demo", needs: [{ itemId: "onion", quantity: 3 }] }).success, true);
  assert.equal(purchaseRequestSchema.safeParse({ branchId: "branch-01", idempotencyKey: "key-0001", provider: "demo", needs: [{ itemId: "onion", quantity: 3 }], wallet: "0x1234" }).success, false);
  assert.equal(purchasePlanSchema.safeParse({ supplierId: "fresh-first", items: [{ itemId: "onion", quantity: 0 }], rationale: "invalid quantity" }).success, false);
});
