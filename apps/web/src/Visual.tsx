import { ArrowDownToLine, Check, CircleAlert, CircleCheck, Clock3, Copy, LockKeyhole, ShieldAlert, XCircle } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import type { PurchaseRecord, PurchaseStatus } from "@franchise/shared";

export const won = (amount: number) => `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
export const koreanDate = (value: string) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));

const stateText: Record<PurchaseStatus, string> = {
  queued: "대기 중", planning: "조건 확인 중", awaiting_chain: "체인 확인 중", paid_simulated: "가상 결제 완료", paid_onchain: "체인 결제 완료", blocked: "승인 범위 초과", failed: "처리 실패",
};

export function StatusPill({ status }: { status: PurchaseStatus }) {
  const Icon = status === "paid_onchain" || status === "paid_simulated" ? CircleCheck : status === "blocked" ? ShieldAlert : status === "failed" ? XCircle : Clock3;
  return <span className={`state state-${status}`}><Icon size={14} strokeWidth={1.8} aria-hidden="true" />{stateText[status]}</span>;
}

export function NumberValue({ children }: PropsWithChildren) { return <span className="num">{children}</span>; }

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><CircleAlert size={19} strokeWidth={1.6} aria-hidden="true" /><div><strong>{title}</strong><p>{description}</p>{action}</div></div>;
}

export function Modal({ title, onClose, children }: PropsWithChildren<{ title: string; onClose: () => void }>) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="닫기"><XCircle size={19} /></button></header>{children}</section></div>;
}

export function InlineAlert({ tone, children }: PropsWithChildren<{ tone: "danger" | "notice" | "success" }>) {
  const Icon = tone === "danger" ? ShieldAlert : tone === "success" ? Check : CircleAlert;
  return <div className={`inline-alert alert-${tone}`} role="status"><Icon size={16} aria-hidden="true" /><span>{children}</span></div>;
}

export function CopyButton({ value, label = "복사" }: { value: string; label?: string }) {
  return <button className="text-button copy-button" onClick={() => void navigator.clipboard?.writeText(value)} title={`${label} 복사`}><Copy size={14} aria-hidden="true" />{label}</button>;
}

export function DownloadButton({ onClick, children = "영수증 JSON" }: PropsWithChildren<{ onClick: () => void }>) {
  return <button className="button button-outline button-compact" onClick={onClick}><ArrowDownToLine size={15} aria-hidden="true" />{children}</button>;
}

export function OrderStatusMessage({ order }: { order: PurchaseRecord | null }) {
  if (!order) return null;
  const success = order.status === "paid_simulated" || order.status === "paid_onchain";
  const pending = ["queued", "planning", "awaiting_chain"].includes(order.status);
  const tone = success ? "success" : order.status === "failed" || order.status === "blocked" ? "danger" : "notice";
  return <InlineAlert tone={tone}>
    <span className="order-stage"><StatusPill status={order.status} />{pending ? "주문 조건과 체인 결과를 확인하고 있습니다." : order.error || (order.chainMode === "simulated" ? "데모 결제 기록입니다. 실제 결제나 온체인 거래는 발생하지 않았습니다." : "승인 범위 안의 결제가 체인에 기록되었습니다.")}</span>
  </InlineAlert>;
}
