import { useId, useState } from "react";
import { Button } from "../../../design-system/components/Button";
import { Card } from "../../../design-system/components/Card";
import { Input, Select } from "../../../design-system/components/Input";
import { Spinner } from "../../../design-system/components/Spinner";
import type { HardPolicy, PlanningFormInput } from "../../lib/types";

/**
 * PlanningForm — Notion PSEUDO 2 정의:
 * "기본 구매 조건 UI: 예산 한도·유효기간·잔여 예산 / 가격·리뷰 평점·배송 속도.
 *  나머지는 추가 설정." Hard Constraint 값은 읽기 전용으로만 보여준다.
 */
export function PlanningForm({
  hardPolicy,
  busy,
  initial,
  onSubmit,
}: {
  hardPolicy: HardPolicy;
  busy: boolean;
  /** 이전 화면으로 돌아왔을 때 방금 입력했던 값을 그대로 복원한다. */
  initial?: PlanningFormInput | null;
  onSubmit: (form: PlanningFormInput) => void;
}) {
  const intentId = useId();
  const [intentText, setIntentText] = useState(initial?.intentText ?? "");
  // 빈 문자열을 잠깐 허용해야 "1"을 지우고 "4"를 이어 쓸 때 "14"가 되지 않는다.
  const [quantity, setQuantity] = useState<number | "">(initial?.quantity ?? 5);
  const [targetUnitPrice, setTargetUnitPrice] = useState<number | "">(
    initial?.softPreference.targetUnitPrice ?? "",
  );
  const [minRating, setMinRating] = useState(initial?.softPreference.minRating ?? 4);
  const [deliverySpeed, setDeliverySpeed] = useState<"standard" | "express">(
    initial?.softPreference.deliverySpeed ?? "standard",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const adjustQuantity = (delta: number) =>
    setQuantity((prev) => Math.max(1, (prev === "" ? 0 : prev) + delta));
  const commitQuantity = () => setQuantity((prev) => (prev === "" || prev < 1 ? 1 : prev));

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
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">수량</label>
          <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-neutral-300 focus-within:border-primary-500 focus-within:shadow-focus">
            <button
              type="button"
              aria-label="수량 1 감소"
              className="w-10 shrink-0 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200"
              onClick={() => adjustQuantity(-1)}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={commitQuantity}
              className="w-full border-x border-neutral-200 text-center text-sm text-neutral-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              aria-label="수량 1 증가"
              className="w-10 shrink-0 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200"
              onClick={() => adjustQuantity(1)}
            >
              +
            </button>
          </div>
          <span className="text-xs text-neutral-500">버튼으로 조정하거나 숫자를 직접 입력하세요.</span>
        </div>
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
        <Input
          type="number"
          min={0}
          label="희망 단가(선택, 개당 원)"
          placeholder="예: 15000"
          value={targetUnitPrice}
          onChange={(e) => setTargetUnitPrice(e.target.value === "" ? "" : Number(e.target.value))}
        />
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
              quantity: quantity === "" ? 1 : quantity,
              softPreference: {
                targetUnitPrice: targetUnitPrice === "" ? null : targetUnitPrice,
                minRating,
                deliverySpeed,
              },
            })
          }
        >
          {busy && <Spinner />}
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
