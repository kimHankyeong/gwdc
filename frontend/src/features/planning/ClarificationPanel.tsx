import { useState } from "react";
import { Button } from "../../../design-system/components/Button";
import { Card } from "../../../design-system/components/Card";
import { Input } from "../../../design-system/components/Input";
import { Badge } from "../../../design-system/components/Badge";
import { Spinner } from "../../../design-system/components/Spinner";

/**
 * ClarificationPanel — "서칭 과정에서 사용자의 지시가 모호한 경우 … 억지로 추론하거나
 * 검색하지 않고 사용자에게 되물음." 되묻기는 한 번에 하나의 질문만 보여준다.
 */
export function ClarificationPanel({
  question,
  busy,
  onAnswer,
}: {
  question: string;
  busy: boolean;
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge tone="warning">되묻기 필요</Badge>
        <span className="text-xs text-neutral-500">NEEDS_INPUT</span>
      </div>
      <p className="text-body-lg text-neutral-800">{question}</p>
      <Input
        label="답변"
        placeholder="예: 양파 10kg"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && answer.trim()) onAnswer(answer);
        }}
      />
      <div className="flex justify-end">
        <Button disabled={busy || !answer.trim()} onClick={() => onAnswer(answer)}>
          {busy && <Spinner />}
          {busy ? "확인하는 중…" : "답변 보내기"}
        </Button>
      </div>
    </Card>
  );
}
