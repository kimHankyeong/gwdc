import { useCallback, useEffect, useState } from "react";
import { Activity, BookOpenCheck, Building2, ClipboardList, FileText, LogOut, RefreshCw, ShieldCheck, Store } from "lucide-react";
import type { PurchaseRecord } from "@franchise/shared";
import { api, loadBootstrap, type Bootstrap } from "./api.js";
import { HeadquartersPanel } from "./HeadquartersPanel.js";
import { LedgerPanel } from "./LedgerPanel.js";
import { OrdersPanel } from "./OrdersPanel.js";
import { OrderStatusMessage } from "./Visual.js";

type Page = "overview" | "policy" | "orders" | "ledger";

export function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseRecord | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { setData(await loadBootstrap()); }, []);

  useEffect(() => { void refresh().catch(() => setData(null)); }, [refresh]);
  useEffect(() => {
    if (!selectedOrder || !["queued", "planning", "awaiting_chain"].includes(selectedOrder.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const { purchase } = await api<{ purchase: PurchaseRecord }>(`/api/orders/${encodeURIComponent(selectedOrder.id)}`);
        setSelectedOrder(purchase);
        if (!["queued", "planning", "awaiting_chain"].includes(purchase.status)) await refresh();
      } catch { /* Keep the last visible execution state during a transient refresh error. */ }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [selectedOrder, refresh]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3200); return () => window.clearTimeout(timer); }, [toast]);

  const login = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/session", { method: "POST", body: JSON.stringify({ userId }) });
      setData(await loadBootstrap());
      setSelectedOrder(null);
      setPage(userId === "hq" ? "overview" : "orders");
    } catch (error) { setToast(error instanceof Error ? error.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    await api("/api/session", { method: "DELETE" });
    setSelectedOrder(null);
    await refresh();
  };

  if (!data) return <main className="login-shell"><section className="login-panel"><div className="brand-mark login-mark">FP</div><p className="eyebrow">FRANCHISE PROCUREMENT · LOCAL DEMO</p><h1>가맹점 식자재 발주 관리</h1><p className="subheading">본사 승인과 지점 발주를 하나의 원장으로 확인합니다.</p><div className="login-options">{[
    { id: "hq", name: "본사 운영 담당자", detail: "지점 정책 승인 · 사용액 · 중단", Icon: Building2 },
    { id: "branch-01", name: "강남 1호점", detail: "가맹점 발주 · 처리 상태", Icon: Store },
    { id: "branch-02", name: "성수 2호점", detail: "가맹점 발주 · 처리 상태", Icon: Store },
  ].map(({ id, name, detail, Icon }) => <button key={id} className="login-option" onClick={() => void login(id)} disabled={busy}><Icon size={19} /><span><strong>{name}</strong><small>{detail}</small></span><span aria-hidden="true">→</span></button>)}</div><p className="login-disclaimer">로컬 시연 계정 · 실제 자금 이동 없음</p></section>{toast && <div className="toast" role="status">{toast}</div>}</main>;

  const user = data.user;
  if (!user) return <main className="login-shell"><section className="login-panel"><div className="brand-mark login-mark">FP</div><p className="eyebrow">FRANCHISE PROCUREMENT · LOCAL DEMO</p><h1>가맹점 식자재 발주 관리</h1><p className="subheading">시연할 역할을 선택하세요.</p><div className="login-options">{data.users.map((candidate) => <button key={candidate.id} className="login-option" onClick={() => void login(candidate.id)} disabled={busy}><span className="login-role-icon">{candidate.role === "HQ" ? <Building2 size={19} /> : <Store size={19} />}</span><span><strong>{candidate.displayName}</strong><small>{candidate.role === "HQ" ? "지점 정책 승인 · 사용액 · 중단" : "가맹점 발주 · 처리 상태"}</small></span><span aria-hidden="true">→</span></button>)}</div><p className="login-disclaimer">로컬 시연 계정 · 실제 자금 이동 없음</p></section>{toast && <div className="toast" role="status">{toast}</div>}</main>;

  const hq = user.role === "HQ";
  const titles: Record<Page, string> = { overview: "운영 현황", policy: "지출 정책", orders: "식자재 발주", ledger: "거래 원장" };
  const visiblePage: Page = hq ? (page === "orders" ? "overview" : page) : (page === "ledger" ? "orders" : page);
  const nav = hq ? [
    { id: "overview" as const, title: "운영 현황", Icon: Activity }, { id: "policy" as const, title: "승인 정책", Icon: ShieldCheck }, { id: "ledger" as const, title: "거래 원장", Icon: FileText },
  ] : [
    { id: "orders" as const, title: "식자재 발주", Icon: ClipboardList }, { id: "ledger" as const, title: "발주 내역", Icon: BookOpenCheck },
  ];

  return <div className="app-shell">
    <aside className="side-rail"><div className="brand-block"><div className="brand-mark">FP</div><div><p className="brand-name">가맹 조달 관리</p><p className="brand-subtitle">FRANCHISE · LEDGER</p></div></div><div className="rail-context"><p className="rail-context-label">현재 접속</p><div className="rail-user"><span className="role-square">{hq ? "HQ" : "BR"}</span><span>{user.displayName}</span></div></div><nav className="rail-navigation" aria-label="주 메뉴"><p className="nav-label">WORKSPACE</p>{nav.map(({ id, title, Icon }) => <button key={id} className={`nav-item ${visiblePage === id ? "nav-item-active" : ""}`} onClick={() => { setPage(id); setSelectedOrder(null); }}><Icon className="nav-icon" aria-hidden="true" />{title}</button>)}</nav><div className="rail-footer"><span className="sandbox-marker"><span className="live-dot dot-amber" />LOCAL SANDBOX</span><p className="rail-footer-note">가격·잔액은 시연용 데이터입니다.<br />실제 결제는 발생하지 않습니다.</p></div></aside>
    <div className="main-column"><header className="top-bar"><div className="crumbs"><span>조달 관리</span><span className="crumb-separator">/</span><strong className="crumb-current">{titles[visiblePage]}</strong></div><div className="top-actions"><span className="mode-tag"><span className={`live-dot ${data.chainMode === "rpc" ? "dot-green" : "dot-amber"}`} />{data.chainMode === "rpc" ? "PRIVATE CHAIN" : "SIMULATION"}</span><button className="account-toggle" onClick={() => void logout()} title="로그아웃"><span className="account-copy"><strong>{user.displayName}</strong><span>{hq ? "HEADQUARTERS" : user.branchId?.toUpperCase()}</span></span><LogOut size={15} /></button></div></header><main className="main-content">
      {selectedOrder && <section className="detail-drawer"><div className="detail-drawer-head"><div><p className="eyebrow">ORDER EXECUTION</p><strong>발주 처리 상세 · {selectedOrder.id.slice(0, 8).toUpperCase()}</strong></div><button className="text-button" onClick={() => setSelectedOrder(null)}>닫기</button></div><OrderStatusMessage order={selectedOrder} /><dl className="detail-fields"><div><dt>가맹점</dt><dd>{selectedOrder.branchId}</dd></div><div><dt>공급업체</dt><dd>{selectedOrder.supplierId ?? "선정 전"}</dd></div><div><dt>정책 버전</dt><dd>{selectedOrder.policyVersion ? `v${selectedOrder.policyVersion}` : "확인 중"}</dd></div><div><dt>체인 트랜잭션</dt><dd className="mono">{selectedOrder.txHash ?? "없음"}</dd></div></dl></section>}
      {hq && visiblePage !== "ledger" ? <HeadquartersPanel data={data} mode={visiblePage === "policy" ? "policy" : "overview"} refresh={refresh} notice={setToast} /> : user.role === "BRANCH" && visiblePage !== "ledger" ? <OrdersPanel data={data} refresh={refresh} onOrder={setSelectedOrder} selectedOrder={selectedOrder} /> : <LedgerPanel data={data} onOrder={setSelectedOrder} />}
      <div className="refresh-row"><span><span className="live-dot dot-green" />데이터 연결됨 · {data.demoMode ? "로컬 데모" : "운영 설정"}</span><button className="text-button" onClick={() => void refresh()}><RefreshCw size={14} />새로고침</button></div>
    </main></div>{toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
