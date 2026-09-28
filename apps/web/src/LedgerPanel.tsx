import { useState } from "react";
import { ArrowRight, Download, Search, ShieldCheck } from "lucide-react";
import type { Bootstrap } from "./api.js";
import type { AuditEvent, PurchaseRecord } from "@franchise/shared";
import { api } from "./api.js";
import { CopyButton, DownloadButton, EmptyState, StatusPill, koreanDate, won } from "./Visual.js";

type Props = { data: Bootstrap; onOrder: (purchase: PurchaseRecord) => void };

function eventLabel(type: string) {
  const titles: Record<string, string> = {
    "bootstrap": "데모 데이터 준비", "session.started": "로그인", "session.ended": "로그아웃", "policy.approved": "본사 정책 승인", "policy.onchain": "온체인 정책 확정", "policy.revoked": "본사 지출 중단 요청", "policy.stop-confirmed": "온체인 중단 확정", "purchase.queued": "발주 접수", "purchase.planning": "정책 검토 시작", "purchase.validated": "가격·조건 재검증", "purchase.awaiting_chain": "온체인 결제 접수", "purchase.paid_simulated": "모의 결제 기록", "purchase.paid_onchain": "온체인 결제 완료", "purchase.blocked": "정책 차단", "purchase.failed": "실행 실패", "purchase.recovered": "작업 복구",
  };
  return titles[type] ?? type;
}

export function LedgerPanel({ data, onOrder }: Props) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const orders = data.orders ?? [];
  const filtered = orders.filter((order) => {
    const text = `${order.id} ${order.branchId} ${order.supplierId ?? ""} ${order.status} ${order.error ?? ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  const downloadReceipt = async (id: string) => {
    try {
      const receipt = await api<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}/receipt`);
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `receipt-${id}.json`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : "영수증을 내려받지 못했습니다."); }
  };

  const eventsByOrder = new Map<string, AuditEvent[]>();
  for (const event of data.events ?? []) if (event.purchaseId) eventsByOrder.set(event.purchaseId, [...(eventsByOrder.get(event.purchaseId) ?? []), event]);

  return <div className="page-stack">
    <section className="page-intro"><div><p className="eyebrow">AUDIT · SETTLEMENT JOURNAL</p><h2>거래 원장</h2><p className="subheading">정책 승인부터 차단·정산까지 발주 흐름을 확인하고 영수증을 내보냅니다.</p></div><span className="period-note">최근 최대 100건 · 시간은 한국 기준</span></section>
    <div className="ledger-tools"><label className="search-box"><Search size={16} aria-hidden="true" /><input data-testid="ledger-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지점, 거래 번호 또는 상태 검색" /></label><span className="table-count">{filtered.length}건 조회</span></div>
    {error && <p className="inline-error" role="status">{error}</p>}
    <section className="panel ledger-panel"><div className="panel-heading"><div><p className="eyebrow">PURCHASE EVIDENCE</p><h3>발주별 증빙</h3></div><Download size={17} className="muted-icon" aria-hidden="true" /></div>
      {filtered.length === 0 ? <EmptyState title="조건에 맞는 거래가 없습니다" description="가맹점이 발주를 실행하면 정책 버전과 처리 기록이 표시됩니다." /> : <div className="table-wrap"><table className="data-table ledger-table"><thead><tr><th>거래 시각</th>{data.user?.role === "HQ" && <th>가맹점</th>}<th>거래 상태</th><th className="numeric-cell">품목 소계</th><th className="numeric-cell">배송비</th><th className="numeric-cell">총액</th><th>체인 증빙</th><th>기록</th></tr></thead><tbody>
        {filtered.map((order) => <tr key={order.id} data-testid="ledger-row"><td className="muted-cell">{koreanDate(order.createdAt)}</td>{data.user?.role === "HQ" && <td>{order.branchId}</td>}<td><StatusPill status={order.status} /><span className="cell-subtext">정책 {order.policyVersion ? `v${order.policyVersion}` : "—"}</span></td><td className="numeric-cell">{order.subtotal === undefined ? "—" : won(order.subtotal)}</td><td className="numeric-cell">{order.deliveryFee === undefined ? "—" : won(order.deliveryFee)}</td><td className="numeric-cell primary-cell">{order.total === undefined ? "—" : won(order.total)}</td><td>{order.txHash ? <div className="hash-compact"><span className="mono">{order.txHash.slice(0, 10)}…</span><CopyButton value={order.txHash} /></div> : <span className="muted-cell">{order.chainMode === "simulated" ? "모의 · tx 없음" : "미확정"}</span>}</td><td><div className="row-actions"><button className="text-button" data-testid={`audit-${order.id}`} onClick={() => onOrder(order)}><ArrowRight size={14} />상세</button><DownloadButton onClick={() => void downloadReceipt(order.id)} /></div></td></tr>)}
      </tbody></table></div>}
    </section>
    <section className="panel audit-history"><div className="panel-heading"><div><p className="eyebrow">IMMUTABLE EVENT ORDER</p><h3>최근 감사 기록</h3></div><span className="table-count">{data.events?.length ?? 0}건</span></div>
      {(data.events?.length ?? 0) === 0 ? <EmptyState title="감사 기록이 없습니다" description="정책 변경과 발주 실행은 기록으로 남습니다." /> : <ol className="event-timeline">{data.events!.slice(0, 30).map((event) => <li key={event.id}><span className={`timeline-dot ${event.type.includes("blocked") || event.type.includes("revoked") ? "timeline-alert" : ""}`} />{event.type.includes("policy.approved") || event.type.includes("purchase.paid_onchain") ? <ShieldCheck size={15} className="timeline-icon" aria-hidden="true" /> : null}<div className="event-content"><div className="event-title-row"><strong>{eventLabel(event.type)}</strong><span className="mono">{event.actorId}</span></div><p>{event.message}</p>{event.purchaseId && <span className="mono event-record-id">{event.purchaseId}</span>}</div><time dateTime={event.createdAt}>{koreanDate(event.createdAt)}</time></li>)}</ol>}
    </section>
    <aside className="ledger-note"><strong>증빙 범위</strong><span>JSON 영수증에는 승인 정책 스냅샷, 세부 내역 해시, 발주 상태, 감사 이벤트가 포함됩니다. 모의 실행에서는 실제 온체인 거래가 없음을 표시합니다.</span></aside>
  </div>;
}
