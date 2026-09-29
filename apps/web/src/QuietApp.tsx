import { useCallback, useEffect, useState } from "react";
import { Activity, BookOpenCheck, Building2, ClipboardList, FileText, LogOut, RefreshCw, ShieldCheck, Store } from "lucide-react";
import type { PurchaseRecord } from "@franchise/shared";
import { api, loadBootstrap, type Bootstrap } from "./api.js";
import { QuietHeadquartersPanel } from "./QuietHeadquartersPanel.js";
import { QuietLedgerPanel } from "./QuietLedgerPanel.js";
import { QuietOrdersPanel } from "./QuietOrdersPanel.js";
import { OrderStatusMessage } from "./Visual.js";

type Page = "overview" | "policy" | "orders" | "ledger";

export function QuietApp() {
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

  if (!data) return <main className="quiet-login"><p>화면을 준비하고 있습니다.</p></main>;

  const user = data.user;
  if (!user) return <main className="quiet-login">
    <section className="quiet-login-inner">
      <div className="quiet-brand">FP</div>
      <p className="quiet-kicker">FRANCHISE PROCUREMENT</p>
      <h1>어디에서 시작할까요?</h1>
      <p className="quiet-lead">시연할 역할을 선택하세요. 실제 결제는 발생하지 않습니다.</p>
      <div className="role-list">
        {data.users.map((candidate) => {
          const Icon = candidate.role === "HQ" ? Building2 : Store;
          return <button key={candidate.id} className="role-choice" onClick={() => void login(candidate.id)} disabled={busy}>
            <span className="role-choice-icon"><Icon size={18} /></span>
            <span><strong>{candidate.displayName}</strong><small>{candidate.role === "HQ" ? "정책과 운영 현황 관리" : "필요한 식자재 발주"}</small></span>
            <span aria-hidden="true">→</span>
          </button>;
        })}
      </div>
    </section>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;

  const hq = user.role === "HQ";
  const visiblePage: Page = hq ? (page === "orders" ? "overview" : page) : (page === "overview" || page === "policy" ? "orders" : page);
  const nav = hq ? [
    { id: "overview" as const, title: "운영", Icon: Activity },
    { id: "policy" as const, title: "정책", Icon: ShieldCheck },
    { id: "ledger" as const, title: "기록", Icon: FileText },
  ] : [
    { id: "orders" as const, title: "구매 요청", Icon: ClipboardList },
    { id: "ledger" as const, title: "구매 기록", Icon: BookOpenCheck },
  ];

  return <div className="quiet-shell">
    <header className="quiet-header">
      <button className="wordmark" onClick={() => { setPage(hq ? "overview" : "orders"); setSelectedOrder(null); }} aria-label="첫 화면으로 이동">
        <span>FP</span><strong>가맹 조달</strong>
      </button>
      <nav className="quiet-nav" aria-label="주 메뉴">
        {nav.map(({ id, title, Icon }) => <button key={id} className={visiblePage === id ? "is-current" : ""} aria-current={visiblePage === id ? "page" : undefined} onClick={() => { setPage(id); setSelectedOrder(null); }}>
          <Icon size={15} aria-hidden="true" />{title}
        </button>)}
      </nav>
      <div className="quiet-account">
        <span className="chain-indicator"><i className={data.chainMode === "rpc" ? "online" : "demo"} />{data.chainMode === "rpc" ? "온체인" : "데모"}</span>
        <span className="account-name">{user.displayName}</span>
        <button className="icon-button" onClick={() => void logout()} aria-label="로그아웃" title="로그아웃"><LogOut size={16} aria-hidden="true" /></button>
      </div>
    </header>

    <main className="quiet-main">
      {selectedOrder && <section className="execution-note" aria-label="최근 구매 처리 상태">
        <div className="execution-note-head"><div><span>최근 구매 요청</span><strong>{selectedOrder.id.slice(0, 8).toUpperCase()}</strong></div><button className="text-button" onClick={() => setSelectedOrder(null)}>닫기</button></div>
        <OrderStatusMessage order={selectedOrder} />
        <details className="quiet-details"><summary>처리 세부 정보</summary><dl className="detail-fields"><div><dt>가맹점</dt><dd>{selectedOrder.branchId}</dd></div><div><dt>공급업체</dt><dd>{selectedOrder.supplierId ?? "선정 전"}</dd></div><div><dt>정책 버전</dt><dd>{selectedOrder.policyVersion ? `v${selectedOrder.policyVersion}` : "확인 중"}</dd></div><div><dt>체인 증빙</dt><dd className="mono">{selectedOrder.txHash ?? "기록 없음"}</dd></div></dl></details>
      </section>}

      {hq && visiblePage !== "ledger" ? <QuietHeadquartersPanel data={data} mode={visiblePage === "policy" ? "policy" : "overview"} refresh={refresh} notice={setToast} /> : user.role === "BRANCH" && visiblePage !== "ledger" ? <QuietOrdersPanel data={data} refresh={refresh} onOrder={setSelectedOrder} selectedOrder={selectedOrder} /> : <QuietLedgerPanel data={data} onOrder={setSelectedOrder} />}

      <footer className="quiet-footer"><span><i />데이터 연결됨</span><button className="text-button" onClick={() => void refresh()}><RefreshCw size={13} />새로고침</button></footer>
    </main>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
