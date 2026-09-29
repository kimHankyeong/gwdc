import { useState } from "react";
import { ArrowDownToLine, ChevronRight, Search } from "lucide-react";
import type { PurchaseRecord } from "@franchise/shared";
import { api, type Bootstrap } from "./api.js";
import { StatusPill, koreanDate, won } from "./Visual.js";

type Props = { data: Bootstrap; onOrder: (purchase: PurchaseRecord) => void };

export function QuietLedgerPanel({ data, onOrder }: Props) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const orders = data.orders ?? [];
  const filtered = orders.filter((order) => `${order.id} ${order.branchId} ${order.supplierId ?? ""} ${order.status} ${order.error ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

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

  return <div className="quiet-page ledger-page">
    <section className="quiet-hero compact">
      <p>기록</p>
      <h1>구매 기록</h1>
      <span>{orders.length === 0 ? "아직 기록이 없습니다." : `${orders.length}건의 구매 요청이 있습니다.`}</span>
    </section>

    {orders.length > 0 && <label className="quiet-search"><Search size={16} aria-hidden="true" /><input data-testid="ledger-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="기록 검색" /></label>}
    {error && <p className="inline-error" role="status">{error}</p>}

    <section className="ledger-list" aria-label="구매 기록 목록">
      {filtered.length === 0 ? <div className="quiet-empty"><strong>{orders.length === 0 ? "첫 구매 요청을 기다리고 있습니다" : "검색 결과가 없습니다"}</strong><span>{orders.length === 0 ? "요청을 만들면 정책 판단과 증빙이 이곳에 남습니다." : "다른 검색어를 입력해보세요."}</span></div> : filtered.map((order) => <details className="ledger-row" key={order.id} data-testid="ledger-row">
        <summary>
          <div><strong>{data.suppliers.find((item) => item.id === order.supplierId)?.name ?? "공급업체 검토 중"}</strong><span>{koreanDate(order.createdAt)}{data.user?.role === "HQ" ? ` · ${order.branchId}` : ""}</span></div>
          <div><StatusPill status={order.status} /><strong>{order.total === undefined ? "—" : won(order.total)}</strong><ChevronRight size={15} /></div>
        </summary>
        <div className="ledger-row-details">
          <dl className="quiet-row-details"><div><dt>거래 번호</dt><dd className="mono">{order.id}</dd></div><div><dt>정책</dt><dd>{order.policyVersion ? `v${order.policyVersion}` : "확인 중"}</dd></div><div><dt>품목 소계</dt><dd>{order.subtotal === undefined ? "—" : won(order.subtotal)}</dd></div><div><dt>배송비</dt><dd>{order.deliveryFee === undefined ? "—" : won(order.deliveryFee)}</dd></div><div><dt>체인 증빙</dt><dd className="mono">{order.txHash ?? (order.chainMode === "simulated" ? "데모 · 기록 없음" : "확인 중")}</dd></div></dl>
          <div className="ledger-actions"><button className="text-button" data-testid={`audit-${order.id}`} onClick={() => onOrder(order)}>처리 과정 보기</button><button className="text-button" onClick={() => void downloadReceipt(order.id)}><ArrowDownToLine size={14} />영수증 JSON</button></div>
        </div>
      </details>)}
    </section>

    {(data.events?.length ?? 0) > 0 && <details className="quiet-details audit-details"><summary>감사 이벤트 {data.events!.length}건</summary><ol>{data.events!.slice(0, 20).map((event) => <li key={event.id}><span>{event.message}</span><time dateTime={event.createdAt}>{koreanDate(event.createdAt)}</time></li>)}</ol></details>}
  </div>;
}
