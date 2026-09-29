import { Card } from "../../../design-system/components/Card";
import { Badge } from "../../../design-system/components/Badge";
import type { HardPolicy } from "../../lib/types";

/**
 * PolicyViewer — "render fixed policy READ_ONLY; no edit/save actions."
 * 정책 원문은 고정값이며 이 화면에는 저장·수정 버튼을 두지 않는다.
 */
export function PolicyViewer({ policy }: { policy: HardPolicy }) {
  const rows: Array<[string, string]> = [
    ["예산 한도", `${policy.budgetLimit.toLocaleString()}원`],
    ["잔여 예산", `${policy.remainingBudget.toLocaleString()}원`],
    ["단일 거래 최대 금액", `${policy.maxSingleTransaction.toLocaleString()}원`],
    ["허용 판매처", policy.allowedSellers.join(", ")],
    ["정책 유효기간", policy.policyValidUntil],
    ["허용 통화", policy.allowedCurrency],
    ["최소 잔여 예산 조건", `${policy.minRemainingBalance.toLocaleString()}원`],
  ];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold text-neutral-900">Hard Constraint</h2>
        <Badge tone="info">읽기 전용</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between border-b border-neutral-100 pb-2">
            <dt className="text-sm text-neutral-500">{label}</dt>
            <dd className="font-mono text-sm font-medium text-neutral-800">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-neutral-400">
        정책 digest {policy.policyDigest} · 이 값은 UI에서 수정할 수 없습니다. 변경은 본사 정책 화면에서만 가능합니다.
      </p>
    </Card>
  );
}
