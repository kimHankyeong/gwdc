/**
 * 이 파일은 백엔드·Kiln Tool Calling 연동 전 화면 검증용 목(mock) 구현입니다.
 * Notion "PSEUDO 01 · TypeScript UI와 플래닝"의 runPurchaseAgent 상태 전이를
 * 클라이언트에서만 흉내냅니다. 실제 정책 게이트, 서버 승인, 원장 기록은 없습니다.
 */
import type {
  Candidate,
  HardPolicy,
  PlanningFormInput,
  PreparedPurchase,
  PurchaseItem,
  Receipt,
  Supplier,
} from "./types";

/**
 * 강남 1호점은 식자재뿐 아니라 매장 운영에 쓰는 가구·가전·소품도 이 예산 안에서 구매한다.
 * 그래서 Hard Constraint 규모를 식자재 단품 기준이 아니라 가구·가전 구매까지 감당하도록 잡았다.
 */
const HARD_POLICY: HardPolicy = {
  branchId: "branch-01",
  branchName: "강남 1호점",
  budgetLimit: 3000000,
  remainingBudget: 2600000,
  maxSingleTransaction: 1200000,
  allowedSellers: ["새벽마켓", "한결스토어"],
  policyValidUntil: "2026-10-31",
  allowedCurrency: "KRW",
  minRemainingBalance: 300000,
  policyDigest: "pol_8f21ac93",
};

/**
 * 카탈로그는 식자재로 한정하지 않는다. "가구·시계·침대"처럼 매장에 필요한 다른 범주도
 * 포함해서 사용자가 쓸 만한 표현을 keywords에 넓게 등록해 둔다.
 */
const CATALOG: PurchaseItem[] = [
  { id: "chicken", name: "닭다리살", keywords: ["닭다리살", "닭다리", "닭고기"], unit: "kg", unitPrice: 8900 },
  { id: "onion", name: "양파", keywords: ["양파"], unit: "kg", unitPrice: 1800 },
  { id: "lettuce", name: "양상추", keywords: ["양상추", "상추"], unit: "박스", unitPrice: 12000 },
  { id: "rice", name: "쌀", keywords: ["쌀"], unit: "포 20kg", unitPrice: 54000 },
  { id: "oil", name: "식용유", keywords: ["식용유"], unit: "말통", unitPrice: 38000 },
  { id: "chair", name: "사무용 의자", keywords: ["사무용 의자", "의자"], unit: "개", unitPrice: 89000 },
  { id: "desk", name: "책상", keywords: ["책상", "테이블"], unit: "개", unitPrice: 145000 },
  { id: "sofa", name: "소파", keywords: ["소파"], unit: "개", unitPrice: 620000 },
  { id: "bed", name: "침대", keywords: ["침대", "매트리스"], unit: "개", unitPrice: 780000 },
  { id: "watch-wrist", name: "손목시계", keywords: ["손목시계", "시계"], unit: "개", unitPrice: 210000 },
  { id: "watch-wall", name: "벽시계", keywords: ["벽시계"], unit: "개", unitPrice: 45000 },
  { id: "fridge", name: "냉장고", keywords: ["냉장고"], unit: "대", unitPrice: 890000 },
  { id: "washer", name: "세탁기", keywords: ["세탁기"], unit: "대", unitPrice: 650000 },
];

const SUPPLIERS: Supplier[] = [
  { id: "fresh-first", name: "새벽마켓", deliveryFee: 2000, rating: 4.6, express: true, priceMultiplier: 1.04 },
  { id: "market-one", name: "한결스토어", deliveryFee: 4000, rating: 4.3, express: false, priceMultiplier: 0.98 },
];

const VAGUE_WORDS = ["아무거나", "적당히", "알아서", "대충"];

function delay<T>(value: T, ms = 450): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * "양파 10kg"처럼 구체 품목명은 물론, "시계"처럼 범주만 말해도 keywords로 찾는다.
 * 여러 품목이 걸리면(예: "시계" → 손목시계·벽시계) 가장 먼저 등록된 품목을 쓴다 —
 * 실제 구현에서는 여기서 "어떤 시계인가요?"로 한 번 더 되물어야 한다.
 */
function findItem(intentText: string): PurchaseItem | null {
  const text = intentText.trim();
  if (!text) return null;
  return (
    CATALOG.find((item) => item.keywords.some((k) => text.includes(k))) ??
    CATALOG.find((item) => item.keywords.some((k) => k.includes(text))) ??
    null
  );
}

export function getHardPolicy(): HardPolicy {
  return HARD_POLICY;
}

/** Track HardInput: 입력이 모호하면 되묻기 없이 추론하지 않고 즉시 되묻는다. */
export async function startAgentRun(form: PlanningFormInput): Promise<
  | { status: "NEEDS_INPUT"; question: string }
  | { status: "CONSTRAINTS_DRAFT"; item: PurchaseItem }
> {
  const text = form.intentText.trim();
  const isVague = text.length === 0 || VAGUE_WORDS.some((w) => text.includes(w));
  const item = findItem(text);

  if (isVague || !item) {
    return delay({
      status: "NEEDS_INPUT",
      question:
        text.length === 0
          ? "어떤 품목이 필요한지 적어주세요. 예: 양파 10kg"
          : `"${text}"만으로는 어떤 품목인지 특정할 수 없습니다. 카탈로그 품목명(예: 양파, 닭다리살)을 포함해서 다시 적어주세요.`,
    });
  }
  return delay({ status: "CONSTRAINTS_DRAFT", item });
}

/** ClarificationPanel의 답변으로 재개한다. */
export async function answerClarification(answer: string): Promise<
  | { status: "NEEDS_INPUT"; question: string }
  | { status: "CONSTRAINTS_DRAFT"; item: PurchaseItem }
> {
  return startAgentRun({
    intentText: answer,
    quantity: 1,
    softPreference: { targetUnitPrice: null, minRating: 4, deliverySpeed: "standard" },
  });
}

/**
 * simulate_policy: Hard Constraint를 먼저 걸러내고, 남은 후보를 Soft Preference로 정렬한다.
 * 항상 계산은 이 함수(정책 Tool)가 하고, LLM 판단에 맡기지 않는다.
 */
export async function simulatePolicy(
  item: PurchaseItem,
  quantity: number,
  soft: { targetUnitPrice: number | null; minRating: number; deliverySpeed: "standard" | "express" },
): Promise<Candidate[]> {
  const candidates = SUPPLIERS.map((supplier) => {
    const unitPrice = Math.round(item.unitPrice * supplier.priceMultiplier);
    const amount = unitPrice * quantity + supplier.deliveryFee;
    const meetsTargetPrice = soft.targetUnitPrice == null || unitPrice <= soft.targetUnitPrice;
    const reasons: string[] = [];
    let eligible = true;

    if (!HARD_POLICY.allowedSellers.includes(supplier.name)) {
      eligible = false;
      reasons.push("본사가 허용하지 않은 판매처");
    }
    if (amount > HARD_POLICY.maxSingleTransaction) {
      eligible = false;
      reasons.push(`단일 거래 한도(${HARD_POLICY.maxSingleTransaction.toLocaleString()}원) 초과`);
    }
    if (amount > HARD_POLICY.remainingBudget - HARD_POLICY.minRemainingBalance) {
      eligible = false;
      reasons.push("최소 잔여 예산 조건 위반");
    }
    if (eligible && supplier.rating < soft.minRating) {
      eligible = false;
      reasons.push(`최소 평점(${soft.minRating}) 미달`);
    }

    if (eligible) {
      reasons.push(
        soft.targetUnitPrice == null
          ? "희망 단가 조건 없음 · 최저가순 정렬"
          : meetsTargetPrice
            ? `희망 단가(${soft.targetUnitPrice.toLocaleString()}원) 이내`
            : `희망 단가(${soft.targetUnitPrice.toLocaleString()}원) 초과 · 우선순위 하향`,
      );
      if (soft.deliverySpeed === "express" && !supplier.express) {
        reasons.push("빠른 배송 미지원(우선순위 하향)");
      }
    }

    return {
      id: `${supplier.id}-${item.id}`,
      supplier,
      item,
      quantity,
      amount,
      eligible,
      reasonCode: reasons.join(" · "),
      meetsTargetPrice,
    };
  });

  const ranked = [...candidates].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.meetsTargetPrice !== b.meetsTargetPrice) return a.meetsTargetPrice ? -1 : 1;
    return a.amount - b.amount;
  });

  return delay(
    ranked.slice(0, 2).map(({ meetsTargetPrice: _meetsTargetPrice, ...candidate }) => candidate satisfies Candidate),
    600,
  );
}

/** prepare_purchase: 승인된 후보를 실행 가능한 견적으로 고정한다. */
export async function preparePurchase(candidate: Candidate): Promise<PreparedPurchase> {
  return delay({ candidate, policyDigest: HARD_POLICY.policyDigest }, 400);
}

/** execute_purchase: 서버가 승인·Hard 조건·멱등성을 재확인한 뒤 접수한다(목 구현). */
export async function executePurchase(prepared: PreparedPurchase): Promise<Receipt> {
  const { candidate } = prepared;
  return delay(
    {
      purchaseId: `PO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      seller: candidate.supplier.name,
      amount: candidate.amount,
      itemSummary: `${candidate.item.name} ${candidate.quantity}${candidate.item.unit}`,
    },
    700,
  );
}

/** get_audit_status: bounded polling. 실제로는 온체인 확정을 짧게 두 번만 확인한다. */
export async function pollAuditStatus(tick: number): Promise<"pending" | "confirmed"> {
  return delay(tick >= 1 ? "confirmed" : "pending", 900);
}
