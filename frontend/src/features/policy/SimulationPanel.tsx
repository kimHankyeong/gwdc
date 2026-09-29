import { Button } from "../../../design-system/components/Button";
import { Card } from "../../../design-system/components/Card";
import { Badge } from "../../../design-system/components/Badge";
import type { Candidate } from "../../lib/types";

/**
 * SimulationPanel — "display 1-2 computed examples and authoritative reason codes.
 *  on accept: API.approveConstraints(...)". 계산은 정책 Tool(simulatePolicy)이 하고
 * 이 화면은 그 결과만 보여준다.
 */
export function SimulationPanel({
  candidates,
  busy,
  onSimulate,
  onAccept,
}: {
  candidates: Candidate[] | null;
  busy: boolean;
  onSimulate: () => void;
  onAccept: (candidate: Candidate) => void;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold text-neutral-900">시뮬레이션</h2>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onSimulate}>
          {busy ? "계산하는 중…" : "시뮬레이션 실행"}
        </Button>
      </div>

      {!candidates && (
        <p className="text-sm text-neutral-500">
          왼쪽 정책과 구매 조건을 확인한 뒤 시뮬레이션을 실행하면, 조건을 만족하는 판매처 후보
          1~2곳을 근거와 함께 보여줍니다.
        </p>
      )}

      {candidates && (
        <ul className="flex flex-col gap-3">
          {candidates.map((c) => (
            <li key={c.id}>
              <Card
                state={c.eligible ? "default" : "rejected"}
                interactive={c.eligible}
                className="flex flex-col gap-2 p-4"
                onClick={() => c.eligible && onAccept(c)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-900">{c.supplier.name}</span>
                  <Badge tone={c.eligible ? "success" : "danger"}>
                    {c.eligible ? "선정 가능" : "제외"}
                  </Badge>
                </div>
                <p className="text-xs text-neutral-500">
                  {c.item.name} {c.quantity}
                  {c.item.unit} · 평점 {c.supplier.rating}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-neutral-900">
                    {c.amount.toLocaleString()}원
                  </span>
                  {c.eligible && (
                    <Button size="sm" onClick={() => onAccept(c)}>
                      이 후보 수락
                    </Button>
                  )}
                </div>
                <p className="text-xs text-neutral-500">근거: {c.reasonCode}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
