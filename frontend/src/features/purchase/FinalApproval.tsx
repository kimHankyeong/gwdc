import { useEffect, useState } from "react";
import { Button } from "../../../design-system/components/Button";
import { Card } from "../../../design-system/components/Card";
import { Badge } from "../../../design-system/components/Badge";
import { pollAuditStatus } from "../../lib/mockAgentApi";
import type { AuditStatus, PreparedPurchase, Receipt } from "../../lib/types";

/**
 * FinalApproval — "display prepare_purchase result … on confirm: approvePurchase → execute_purchase.
 *  display persisted purchase state and receipt. display audit state separately;
 *  use bounded status polling." 폴링은 최대 2회로 제한한다.
 */
export function FinalApproval({
  prepared,
  receipt,
  busy,
  onConfirm,
}: {
  prepared: PreparedPurchase;
  receipt: Receipt | null;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [audit, setAudit] = useState<AuditStatus | null>(null);

  useEffect(() => {
    if (!receipt) return;
    let cancelled = false;
    let tick = 0;
    const MAX_TICKS = 2; // bounded polling — 무한 재시도하지 않는다.

    async function poll() {
      while (tick < MAX_TICKS && !cancelled) {
        const status = await pollAuditStatus(tick);
        if (cancelled) return;
        setAudit(status);
        if (status === "confirmed") return;
        tick += 1;
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [receipt]);

  const { candidate } = prepared;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-neutral-900">최종 확인</h2>
        <Badge tone={receipt ? "success" : "info"}>{receipt ? "접수됨" : "READY"}</Badge>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md bg-neutral-50 p-4 sm:grid-cols-2">
        <Row label="품목" value={`${candidate.item.name} ${candidate.quantity}${candidate.item.unit}`} />
        <Row label="판매처" value={candidate.supplier.name} />
        <Row label="정책 digest" value={prepared.policyDigest} mono />
        <Row label="결제 금액" value={`${candidate.amount.toLocaleString()}원`} emphasis />
      </dl>

      {!receipt && (
        <div className="flex justify-end">
          <Button size="lg" disabled={busy} onClick={onConfirm}>
            {busy ? "접수하는 중…" : "구매 확정"}
          </Button>
        </div>
      )}

      {receipt && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">영수증</span>
            <span className="font-mono text-xs text-neutral-500">{receipt.purchaseId}</span>
          </div>
          <p className="text-sm text-neutral-600">
            {receipt.itemSummary} · {receipt.seller} ·{" "}
            <span className="font-mono">{receipt.amount.toLocaleString()}원</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">감사(audit) 상태</span>
            <Badge tone={audit === "confirmed" ? "success" : "warning"}>
              {audit === "confirmed" ? "온체인 확정" : audit === "pending" ? "확인 중" : "대기"}
            </Badge>
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd
        className={
          (mono ? "font-mono " : "") +
          (emphasis ? "text-numeric-lg font-bold text-primary-700" : "text-sm font-medium text-neutral-800")
        }
      >
        {value}
      </dd>
    </div>
  );
}
