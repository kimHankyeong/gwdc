import { useState } from "react";
import { Button } from "../../../design-system/components/Button";
import { Card } from "../../../design-system/components/Card";
import { Badge } from "../../../design-system/components/Badge";
import {
  answerClarification,
  executePurchase,
  getHardPolicy,
  preparePurchase,
  simulatePolicy,
  startAgentRun,
} from "../../lib/mockAgentApi";
import type {
  Candidate,
  PlanningFormInput,
  PreparedPurchase,
  PurchaseItem,
  Receipt,
  RunStatus,
} from "../../lib/types";
import { PlanningForm } from "./PlanningForm";
import { ClarificationPanel } from "./ClarificationPanel";
import { PolicyViewer } from "../policy/PolicyViewer";
import { SimulationPanel } from "../policy/SimulationPanel";
import { FinalApproval } from "../purchase/FinalApproval";

/**
 * PlanningPage — Notion PSEUDO 2의 오케스트레이터.
 * "render server state: NEEDS_INPUT / CONSTRAINTS_DRAFT / POLICY_NOT_READY / READY / REJECTED"
 * 이 화면 하나가 상태에 따라 아래 화면을 갈아 끼운다. 실제로는 Node.js API가 상태를 갖지만,
 * 여기서는 mockAgentApi가 같은 상태 이름을 그대로 반환한다.
 */
export function PlanningPage() {
  const hardPolicy = getHardPolicy();
  const [status, setStatus] = useState<RunStatus>("DRAFT");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [pendingForm, setPendingForm] = useState<PlanningFormInput | null>(null);
  const [resolvedItem, setResolvedItem] = useState<PurchaseItem | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [prepared, setPrepared] = useState<PreparedPurchase | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [rejectReasons, setRejectReasons] = useState<string[]>([]);

  const restart = () => {
    setStatus("DRAFT");
    setQuestion("");
    setPendingForm(null);
    setResolvedItem(null);
    setCandidates(null);
    setPrepared(null);
    setReceipt(null);
    setRejectReasons([]);
  };

  const handleSubmit = async (form: PlanningFormInput) => {
    setBusy(true);
    setPendingForm(form);
    try {
      const result = await startAgentRun(form);
      if (result.status === "NEEDS_INPUT") {
        setQuestion(result.question);
        setStatus("NEEDS_INPUT");
      } else {
        setResolvedItem(result.item);
        setStatus("CONSTRAINTS_DRAFT");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAnswer = async (answer: string) => {
    setBusy(true);
    try {
      const result = await answerClarification(answer);
      if (result.status === "NEEDS_INPUT") {
        setQuestion(result.question);
      } else {
        setPendingForm((prev) => (prev ? { ...prev, intentText: answer } : prev));
        setResolvedItem(result.item);
        setStatus("CONSTRAINTS_DRAFT");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSimulate = async () => {
    if (!pendingForm || !resolvedItem) return;
    setBusy(true);
    try {
      const result = await simulatePolicy(resolvedItem, pendingForm.quantity, pendingForm.softPreference);
      setCandidates(result);
      if (result.every((c) => !c.eligible)) {
        setRejectReasons(result.map((c) => c.reasonCode));
        setStatus("REJECTED");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (candidate: Candidate) => {
    setBusy(true);
    try {
      const result = await preparePurchase(candidate);
      setPrepared(result);
      setStatus("READY");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!prepared) return;
    setBusy(true);
    setStatus("EXECUTING");
    try {
      const result = await executePurchase(prepared);
      setReceipt(result);
      setStatus("COMPLETED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-600 text-xs font-bold text-white">
            GD
          </span>
          <span className="text-sm font-semibold text-neutral-800">가맹 구매 에이전트</span>
        </div>
        <Badge tone="neutral">{status}</Badge>
      </header>

      {status === "DRAFT" && (
        <PlanningForm hardPolicy={hardPolicy} busy={busy} onSubmit={handleSubmit} />
      )}

      {status === "NEEDS_INPUT" && (
        <ClarificationPanel question={question} busy={busy} onAnswer={handleAnswer} />
      )}

      {status === "CONSTRAINTS_DRAFT" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PolicyViewer policy={hardPolicy} />
          <SimulationPanel
            candidates={candidates}
            busy={busy}
            onSimulate={handleSimulate}
            onAccept={handleAccept}
          />
        </div>
      )}

      {(status === "READY" || status === "EXECUTING" || status === "COMPLETED") && prepared && (
        <FinalApproval prepared={prepared} receipt={receipt} busy={busy} onConfirm={handleConfirm} />
      )}

      {status === "REJECTED" && (
        <Card state="rejected" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="danger">반려</Badge>
            <span className="text-xs text-neutral-500">REJECTED</span>
          </div>
          <p className="text-body-lg text-neutral-800">
            Hard Constraint를 만족하는 판매처가 없어 구매를 진행할 수 없습니다.
          </p>
          <ul className="list-disc pl-5 text-sm text-neutral-600">
            {rejectReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={restart}>
              다시 시작
            </Button>
          </div>
        </Card>
      )}

      {status === "COMPLETED" && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={restart}>
            새 구매 요청
          </Button>
        </div>
      )}
    </div>
  );
}
