/**
 * Notion "PSEUDO 01 · TypeScript UI와 플래닝" / "구성" 문서에서 정의한 타입입니다.
 * 실제 Kiln Tool Calling·서버 검증은 아직 없고, mockAgentApi가 같은 상태 전이를 흉내냅니다.
 */

export type RunStatus =
  | "DRAFT"
  | "NEEDS_INPUT"
  | "CONSTRAINTS_DRAFT"
  | "POLICY_NOT_READY"
  | "READY"
  | "EXECUTING"
  | "COMPLETED"
  | "REJECTED";

/** Hard Constraint: 하나라도 위반하면 AI 판단과 무관하게 즉시 반려된다. */
export interface HardPolicy {
  branchId: string;
  branchName: string;
  budgetLimit: number;
  remainingBudget: number;
  maxSingleTransaction: number;
  allowedSellers: string[];
  policyValidUntil: string;
  allowedCurrency: "KRW";
  minRemainingBalance: number;
  policyDigest: string;
}

/** Soft Preference: Hard Constraint를 만족한 후보들 사이의 우선순위 결정 기준. */
export interface SoftPreference {
  pricePriority: number; // 0~100, 높을수록 최저가 우선
  minRating: number; // 0~5
  deliverySpeed: "standard" | "express";
}

export interface PurchaseItem {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
}

export interface Supplier {
  id: string;
  name: string;
  deliveryFee: number;
  rating: number;
  express: boolean;
}

export interface PlanningFormInput {
  intentText: string;
  quantity: number;
  softPreference: SoftPreference;
}

export interface Candidate {
  id: string;
  supplier: Supplier;
  item: PurchaseItem;
  quantity: number;
  amount: number;
  eligible: boolean;
  reasonCode: string;
}

export interface PreparedPurchase {
  candidate: Candidate;
  policyDigest: string;
}

export interface Receipt {
  purchaseId: string;
  timestamp: string;
  seller: string;
  amount: number;
  itemSummary: string;
}

export type AuditStatus = "pending" | "confirmed";
