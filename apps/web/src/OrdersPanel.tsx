import { useMemo, useState } from "react";
import { ArrowRight, CircleHelp, FileClock, PackagePlus, RotateCcw, Send } from "lucide-react";
import { api, type Bootstrap } from "./api.js";
import type { PurchaseRecord } from "@franchise/shared";
import { DownloadButton, EmptyState, InlineAlert, NumberValue, OrderStatusMessage, StatusPill, koreanDate, won } from "./Visual.js";

type Props = { data: Bootstrap; refresh: () => Promise<void>; onOrder: (purchase: PurchaseRecord) => void; selectedOrder: PurchaseRecord | null };

export function OrdersPanel({ data, refresh, onOrder, selectedOrder }: Props) {
  const user = data.user!;
  const branchId = user.branchId!;
  const policy = data.policies?.find((item) => item.branchId === branchId) ?? null;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [provider, setProvider] = useState<"codex" | "claude" | "demo">(data.defaultProvider ?? "codex");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState("");
  const remaining = policy ? Math.max(0, policy.budget - policy.spent) : 0;
  const hasNeed = Object.values(quantities).some((quantity) => quantity > 0);
  const selectedLines = useMemo(() => data.catalog.filter((item) => (quantities[item.id] ?? 0) > 0), [data.catalog, quantities]);
  const estimated = selectedLines.reduce((sum, item) => sum + item.price * quantities[item.id]!, 0);
  const valid = Boolean(policy?.active && Date.parse(policy.expiresAt) > Date.now());

  const updateQuantity = (itemId: string, value: number) => setQuantities((current) => ({ ...current, [itemId]: value }));

  const submit = async (scenarioName: string) => {
    setError("");
    if (!valid || !hasNeed || busy) return;
    setBusy(true);
    setScenario(scenarioName);
    try {
      const response = await api<{ purchase: PurchaseRecord }>("/api/orders", { method: "POST", body: JSON.stringify({
        branchId,
        idempotencyKey: crypto.randomUUID(),
        provider,
        needs: data.catalog.filter((item) => (quantities[item.id] ?? 0) > 0).map((item) => ({ itemId: item.id, quantity: quantities[item.id]! })),
      }) });
      onOrder(response.purchase);
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "발주를 접수하지 못했습니다.");
    } finally { setBusy(false); }
  };

  const chooseOverBudgetScenario = () => {
    setQuantities({ chicken: 40 });
    setScenario("예산 초과 조건으로 준비됨");
  };

  const downloadReceipt = async (id: string) => {
    try {
      const receipt = await api<Record<string, unknown>>(`/api/orders/${encodeURIComponent(id)}/receipt`);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
      link.download = `receipt-${id}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : "영수증을 내려받지 못했습니다."); }
  };

  return <div className="page-stack">
    <section className="page-intro">
      <div><p className="eyebrow">BRANCH · WHOLESALE</p><h2>식자재 발주</h2><p className="subheading">필요 수량을 입력하면 승인 조건을 확인한 뒤 공급업체 발주안을 만듭니다.</p></div>
      <div className="branch-context"><span>가맹점</span><strong>{user.displayName}</strong></div>
    </section>

    <section className="summary-strip" aria-label="가맹점 지출 현황">
      <div className="summary-item"><span>승인 예산</span><strong>{won(policy?.budget ?? 0)}</strong></div>
      <div className="summary-item"><span>누적 사용액</span><strong>{won(policy?.spent ?? 0)}</strong></div>
      <div className="summary-item"><span>현재 잔액</span><strong className="summary-emphasis">{won(remaining)}</strong></div>
      <div className="summary-status"><span className={`live-dot ${valid ? "dot-green" : "dot-red"}`} />{valid ? "정책 유효" : "정책 중단 또는 만료"}</div>
    </section>

    {selectedOrder && <section className="order-result" data-testid="order-stage"><div className="result-heading"><FileClock size={16} aria-hidden="true" /><strong>최근 발주 처리</strong><span className="mono">{selectedOrder.id.slice(0, 8).toUpperCase()}</span></div><OrderStatusMessage order={selectedOrder} /><div className="result-details"><span>{selectedOrder.supplierId ? data.suppliers.find((supplier) => supplier.id === selectedOrder.supplierId)?.name : "공급업체 검토 중"}</span><span>{selectedOrder.total === undefined ? "금액 검토 중" : won(selectedOrder.total)}</span>{selectedOrder.txHash && <span className="mono">{selectedOrder.txHash}</span>}</div></section>}

    {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    {!valid && <InlineAlert tone="danger">본사 승인이 중단되었거나 만료되어 새 발주를 접수하지 않습니다.</InlineAlert>}

    <section className="work-grid">
      <div className="panel order-panel">
        <div className="panel-heading"><div><p className="eyebrow">1 — PURCHASE REQUEST</p><h3>주문 수량 입력</h3></div><span className="panel-reference">요청 번호 자동 생성</span></div>
        <div className="catalog-table-wrap"><table className="data-table catalog-table"><thead><tr><th>품목</th><th>단위</th><th className="numeric-cell">예시 단가</th><th className="quantity-col">수량</th></tr></thead><tbody>
          {data.catalog.map((item) => <tr key={item.id}><td className="primary-cell">{item.name}</td><td className="muted-cell">{item.unit}</td><td className="numeric-cell">{won(item.price)}</td><td><label className="quantity-control"><span className="visually-hidden">{item.name} 수량</span><input aria-label={`${item.name} 수량`} data-testid={`qty-${item.id}`} type="number" min="0" max="10000" value={quantities[item.id] ?? 0} onChange={(event) => updateQuantity(item.id, Number(event.target.value) || 0)} /></label></td></tr>)}
        </tbody></table></div>

        <div className="form-row form-row-stack"><label className="field-label" htmlFor="provider-select">발주안 생성 방식</label><select id="provider-select" data-testid="provider-select" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
          <option value="codex">Codex CLI</option><option value="claude">Claude CLI</option><option value="demo">명시적 데모 발주안</option>
        </select><p className="field-hint">{provider === "demo" ? "규칙 기반 예시입니다. LLM 토큰 사용량은 기록되지 않습니다." : `${provider === "codex" ? "Codex" : "Claude"} 로컬 CLI 로그인 정보로 발주안을 생성합니다.`}</p></div>

        <div className="order-summary"><div><span>품목 소계</span><NumberValue>{won(estimated)}</NumberValue></div><div><span>배송비</span><span className="muted-cell">선택 공급업체에 따라 계산</span></div><div className="summary-total"><span>가용 예산</span><NumberValue>{won(remaining)}</NumberValue></div></div>
        {hasNeed && estimated > remaining && <InlineAlert tone="notice">품목 소계가 잔액을 넘었습니다. 에이전트는 정책을 바꾸지 못하며 서버가 배송비도 더해 확인합니다.</InlineAlert>}
        <div className="order-actions"><button className="button button-primary" data-testid="submit-order" onClick={() => void submit("normal")} disabled={!valid || !hasNeed || busy}><Send size={16} aria-hidden="true" />{busy ? "접수 중…" : "발주안 생성 및 접수"}<ArrowRight size={15} aria-hidden="true" /></button><button className="text-button" onClick={() => { setQuantities({}); setScenario(""); }} disabled={!hasNeed || busy}><RotateCcw size={14} />초기화</button></div>
      </div>

      <aside className="panel policy-panel">
        <div className="panel-heading"><div><p className="eyebrow">2 — HQ POLICY</p><h3>본사 승인 범위</h3></div><CircleHelp size={17} className="muted-icon" aria-hidden="true" /></div>
        {policy ? <>
          <div className="policy-line"><span>허용 공급업체</span><strong>{policy.supplierIds.map((id) => data.suppliers.find((supplier) => supplier.id === id)?.name ?? id).join(" · ")}</strong></div>
          <div className="policy-line"><span>승인 버전</span><strong className="mono">v{policy.version}</strong></div>
          <div className="policy-line"><span>승인 만료</span><strong>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(policy.expiresAt))}</strong></div>
          <div className="budget-meter"><div className="meter-head"><span>예산 사용</span><span className="mono">{policy.budget > 0 ? Math.min(100, Math.round(policy.spent / policy.budget * 100)) : 0}%</span></div><div className="meter-track"><span style={{ width: `${policy.budget > 0 ? Math.min(100, policy.spent / policy.budget * 100) : 0}%` }} /></div><div className="meter-foot"><span>사용 {won(policy.spent)}</span><span>전체 {won(policy.budget)}</span></div></div>
          <div className="boundary-note"><strong>중단 경계</strong><p>예산에는 배송비를 포함합니다. 승인 목록·기한·현재 잔액은 서버와 계약이 검사합니다.</p></div>
        </> : <EmptyState title="승인 정책 없음" description="본사에 지출 정책을 문의하세요." />}
      </aside>
    </section>

    <section className="scenario-strip"><div className="scenario-title"><PackagePlus size={16} aria-hidden="true" /><div><strong>검증 시나리오</strong><span>샘플 데이터 · 시뮬레이션 전용</span></div></div><button className="button button-outline button-compact" data-testid="over-budget-scenario" onClick={chooseOverBudgetScenario} disabled={busy}><CircleHelp size={15} />배송비 포함 예산 초과 점검</button><span className="scenario-feedback" role="status">{scenario && scenario !== "normal" ? scenario : ""}</span></section>

    <section className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow">3 — RECENT PURCHASES</p><h3>최근 발주 내역</h3></div><span className="table-count">{data.orders?.length ?? 0}건</span></div>
      {(data.orders?.length ?? 0) === 0 ? <EmptyState title="아직 발주 내역이 없습니다" description="첫 발주안을 접수하면 승인 조건과 함께 여기에 기록됩니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>접수 시각</th><th>공급업체</th><th>발주 상태</th><th className="numeric-cell">결제 금액</th><th>증빙</th></tr></thead><tbody>
        {data.orders!.slice(0, 10).map((order) => <tr key={order.id}><td className="muted-cell">{koreanDate(order.createdAt)}</td><td className="primary-cell">{data.suppliers.find((item) => item.id === order.supplierId)?.name ?? "결정 전"}</td><td><StatusPill status={order.status} /></td><td className="numeric-cell">{order.total === undefined ? "—" : won(order.total)}</td><td><DownloadButton onClick={() => void downloadReceipt(order.id)} /></td></tr>)}
      </tbody></table></div>}
    </section>
  </div>;
}
