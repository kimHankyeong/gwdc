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
  /** 희망 단가(개당, 원). 비워두면 가격 조건 없이 최저가순으로만 정렬한다. */
  targetUnitPrice: number | null;
  minRating: number; // 0~5
  deliverySpeed: "standard" | "express";
}

export interface PurchaseItem {
  id: string;
  name: string;
  /** 사용자 입력에서 이 품목을 찾기 위한 별칭 목록(예: "시계" → 손목시계·벽시계). */
  keywords: string[];
  unit: string;
  unitPrice: number;
}

export interface Supplier {
  id: string;
  name: string;
  deliveryFee: number;
  rating: number;
  express: boolean;
  /** 같은 카탈로그 단가에 곱해지는 판매처별 가격 배율(판매처마다 다른 총액을 만든다). */
  priceMultiplier: number;
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
