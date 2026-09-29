import { useId, useState } from "react";
import { Button } from "../../../design-system/components/Button";
import { Card } from "../../../design-system/components/Card";
import { Input, Select } from "../../../design-system/components/Input";
import type { HardPolicy, PlanningFormInput } from "../../lib/types";

/**
 * PlanningForm — Notion PSEUDO 2 정의:
 * "기본 구매 조건 UI: 예산 한도·유효기간·잔여 예산 / 가격·리뷰 평점·배송 속도.
 *  나머지는 추가 설정." Hard Constraint 값은 읽기 전용으로만 보여준다.
 */
export function PlanningForm({
  hardPolicy,
  busy,
  onSubmit,
}: {
  hardPolicy: HardPolicy;
  busy: boolean;
  onSubmit: (form: PlanningFormInput) => void;
}) {
  const intentId = useId();
  const [intentText, setIntentText] = useState("");
  const [quantity, setQuantity] = useState(5);
  const [pricePriority, setPricePriority] = useState(70);
  const [minRating, setMinRating] = useState(4);
  const [deliverySpeed, setDeliverySpeed] = useState<"standard" | "express">("standard");
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary-600">
          구매 요청
        </p>
        <h1 className="text-h1 font-bold text-neutral-900">무엇을 구매할까요?</h1>
        <p className="text-sm text-neutral-500">
          {hardPolicy.branchName} · 실제 결제는 발생하지 않는 시뮬레이션입니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id={intentId}
          label="구매 품목"
          placeholder="예: 양파 10kg"
          value={intentText}
          onChange={(e) => setIntentText(e.target.value)}
        />
        <Input
          type="number"
          min={1}
          label="수량"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-md bg-neutral-50 p-4 sm:grid-cols-3">
        <ReadOnlyField label="예산 한도" value={`${hardPolicy.budgetLimit.toLocaleString()}원`} />
        <ReadOnlyField label="정책 유효기간" value={hardPolicy.policyValidUntil} />
        <ReadOnlyField
          label="잔여 예산"
          value={`${hardPolicy.remainingBudget.toLocaleString()}원`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">가격 우선도</label>
          <input
            type="range"
            min={0}
            max={100}
            value={pricePriority}
            onChange={(e) => setPricePriority(Number(e.target.value))}
            className="h-2 accent-primary-600"
          />
          <span className="text-xs text-neutral-500">{pricePriority}% · 높을수록 최저가 우선</span>
        </div>
        <Select
          label="최소 리뷰 평점"
          value={minRating}
          onChange={(e) => setMinRating(Number(e.target.value))}
        >
          <option value={3.5}>3.5 이상</option>
          <option value={4}>4.0 이상</option>
          <option value={4.5}>4.5 이상</option>
        </Select>
        <Select
          label="배송 속도"
          value={deliverySpeed}
          onChange={(e) => setDeliverySpeed(e.target.value as "standard" | "express")}
        >
          <option value="standard">일반 배송</option>
          <option value="express">빠른 배송</option>
        </Select>
      </div>

      <details
        className="rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-600"
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced(e.currentTarget.open)}
      >
        <summary className="cursor-pointer select-none font-medium text-neutral-700">
          추가 구성사항
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="선호 브랜드(선택)" placeholder="예: 청정원" />
          <Input label="제외 판매처(선택)" placeholder="쉼표로 구분" />
        </div>
      </details>

      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={busy}
          onClick={() =>
            onSubmit({
              intentText,
              quantity,
              softPreference: { pricePriority, minRating, deliverySpeed },
            })
          }
        >
          {busy ? "확인하는 중…" : "구매안 만들기"}
        </Button>
      </div>
    </Card>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="font-mono text-sm font-medium text-neutral-800">{value}</span>
    </div>
  );
}
