import { useMemo, useState } from "react";
import { BadgeCheck, CircleHelp, History, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { DEMO_USERS, type Policy } from "@franchise/shared";
import { api, type Bootstrap } from "./api.js";
import { EmptyState, InlineAlert, Modal, NumberValue, koreanDate, won } from "./Visual.js";

type Props = { data: Bootstrap; mode: "overview" | "policy"; refresh: () => Promise<void>; notice: (message: string) => void };

export function HeadquartersPanel({ data, mode, refresh, notice }: Props) {
  const [selectedBranch, setSelectedBranch] = useState(DEMO_USERS.find((user) => user.role === "BRANCH")?.branchId ?? "branch-01");
  const [supplierIds, setSupplierIds] = useState<string[]>(data.policies?.find((policy) => policy.branchId === selectedBranch)?.supplierIds ?? []);
  const [budget, setBudget] = useState(String(data.policies?.find((policy) => policy.branchId === selectedBranch)?.budget ?? 200_000));
  const [expiresAt, setExpiresAt] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [stopBranch, setStopBranch] = useState<string | null>(null);

  const policies = data.policies ?? [];
  const branches = DEMO_USERS.filter((user) => user.role === "BRANCH");
  const selectedPolicy = policies.find((policy) => policy.branchId === selectedBranch) ?? null;
  const orders = data.orders ?? [];
  const totalBudget = policies.reduce((sum, policy) => sum + policy.budget, 0);
  const totalSpent = policies.reduce((sum, policy) => sum + policy.spent, 0);
  const completed = orders.filter((order) => order.status === "paid_simulated" || order.status === "paid_onchain");
  const recent = [...orders].slice(0, 7);

  const onBranchChange = (branchId: string) => {
    setSelectedBranch(branchId);
    const policy = policies.find((item) => item.branchId === branchId);
    setSupplierIds(policy?.supplierIds ?? []);
    setBudget(String(policy?.budget ?? 200_000));
    setExpiresAt(policy?.expiresAt ? new Date(policy.expiresAt).toISOString().slice(0, 16) : new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16));
  };

  const toggleSupplier = (supplierId: string) => setSupplierIds((current) => current.includes(supplierId) ? current.filter((id) => id !== supplierId) : [...current, supplierId]);

  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const amount = Number(budget);
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("예산은 0보다 큰 정수여야 합니다.");
      if (supplierIds.length === 0) throw new Error("허용할 공급업체를 한 곳 이상 선택하세요.");
      const result = await api<{ policy: Policy; message: string }>("/api/policies", { method: "PUT", body: JSON.stringify({ branchId: selectedBranch, budget: amount, supplierIds, expiresAt: new Date(expiresAt).toISOString() }) });
      setMessage(`${result.message} · 정책 v${result.policy.version}`);
      notice("가맹점 지출 정책을 저장했습니다.");
      await refresh();
    } catch (saveError) { setMessage(saveError instanceof Error ? saveError.message : "정책을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const stopAgent = async () => {
    if (!stopBranch) return;
    const target = stopBranch;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string; policy: Policy }>(`/api/policies/${encodeURIComponent(target)}/stop`, { method: "POST" });
      setMessage(result.status === "simulated" ? `${target} 중단이 시뮬레이션에 기록되었습니다.` : `${target} 중단이 온체인에 확정되었습니다.`);
      notice(`${target} 에이전트를 중단했습니다.`);
      setStopBranch(null);
      await refresh();
    } catch (stopError) { setMessage(stopError instanceof Error ? stopError.message : "중단 요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  };

  if (mode === "overview") return <div className="page-stack">
    <section className="page-intro"><div><p className="eyebrow">HEADQUARTERS · OPERATIONS</p><h2>가맹 운영 현황</h2><p className="subheading">승인 예산, 지점 발주, 정책 기록을 확인합니다.</p></div><span className="period-note">시뮬레이션 장부</span></section>
    <section className="summary-strip">
      <div className="summary-item"><span>통합 승인 한도</span><strong>{won(totalBudget)}</strong></div>
      <div className="summary-item"><span>누적 사용액</span><strong>{won(totalSpent)}</strong></div>
      <div className="summary-item"><span>완료 거래</span><strong>{completed.length}건</strong></div>
      <div className="summary-status"><span className="live-dot dot-green" />정책 데이터 동기화</div>
    </section>
    {message && <InlineAlert tone="success">{message}</InlineAlert>}
    <section className="panel branch-overview"><div className="panel-heading"><div><p className="eyebrow">BRANCH CONTROL</p><h3>가맹점별 지출 정책</h3></div><span className="table-count">{policies.length}개 매장</span></div>
      {policies.length === 0 ? <EmptyState title="등록한 정책이 없습니다" description="지출 정책 메뉴에서 가맹점별 한도와 공급업체를 승인하세요." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>가맹점</th><th>정책 상태</th><th className="numeric-cell">예산</th><th className="numeric-cell">사용액</th><th>승인 만료</th></tr></thead><tbody>
        {policies.map((policy) => { const branch = branches.find((item) => item.branchId === policy.branchId); const spentPercent = policy.budget > 0 ? Math.min(100, Math.round(policy.spent / policy.budget * 100)) : 0; return <tr key={policy.branchId}><td className="primary-cell">{branch?.displayName ?? policy.branchId}<span className="cell-subtext">{policy.supplierIds.length}곳의 공급업체 허용 · v{policy.version}</span></td><td><span className={`policy-state ${policy.active ? "policy-active" : "policy-stopped"}`}><span className={`live-dot ${policy.active ? "dot-green" : "dot-red"}`} />{policy.active ? "승인 중" : "중단"}</span></td><td className="numeric-cell">{won(policy.budget)}</td><td className="numeric-cell"><span>{won(policy.spent)}</span><span className="cell-progress"><i style={{ width: `${spentPercent}%` }} /></span></td><td className="muted-cell">{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(policy.expiresAt))}</td></tr>; })}
      </tbody></table></div>}
    </section>
    <section className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow">PURCHASE ORDERS</p><h3>최근 발주</h3></div><span className="table-count">{recent.length}건</span></div>
      {recent.length === 0 ? <EmptyState title="최근 거래 없음" description="가맹점이 발주를 접수하면 거래 기록이 나타납니다." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>접수 시각</th><th>가맹점</th><th>공급업체</th><th>처리 상태</th><th className="numeric-cell">금액</th></tr></thead><tbody>{recent.map((order) => <tr key={order.id}><td className="muted-cell">{koreanDate(order.createdAt)}</td><td className="primary-cell">{branches.find((branch) => branch.branchId === order.branchId)?.displayName ?? order.branchId}</td><td>{data.suppliers.find((supplier) => supplier.id === order.supplierId)?.name ?? "미지정"}</td><td><span className={`state state-${order.status}`}>{order.status === "paid_simulated" || order.status === "paid_onchain" ? "완료" : order.status === "blocked" ? "차단" : order.status === "failed" ? "실패" : "처리 중"}</span></td><td className="numeric-cell">{order.total === undefined ? "—" : won(order.total)}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;

  return <div className="page-stack">
    <section className="page-intro"><div><p className="eyebrow">HEADQUARTERS · POLICY DESK</p><h2>가맹점 지출 정책</h2><p className="subheading">지점별 예산, 허용 공급업체, 승인 만료일을 직접 관리합니다.</p></div><span className="period-note">변경 이력 기록</span></section>
    <section className="policy-work-grid">
      <form className="panel policy-form" onSubmit={(event) => void savePolicy(event)}>
        <div className="panel-heading"><div><p className="eyebrow">1 — APPROVAL</p><h3>지출 한도 승인</h3></div><BadgeCheck size={20} className="muted-icon" aria-hidden="true" /></div>
        <label className="form-row form-row-stack"><span className="field-label">대상 가맹점</span><select data-testid="policy-branch" value={selectedBranch} onChange={(event) => onBranchChange(event.target.value)}>{branches.map((branch) => <option key={branch.branchId} value={branch.branchId!}>{branch.displayName}</option>)}</select></label>
        <label className="form-row form-row-stack"><span className="field-label">총 예산 <span className="required-label">필수</span></span><span className="money-input"><input data-testid="policy-budget" type="number" min={selectedPolicy?.spent ?? 1} max="1000000000000" value={budget} onChange={(event) => setBudget(event.target.value)} required /><span>원</span></span><span className="field-hint">이미 사용한 금액보다 낮은 한도는 승인할 수 없습니다.</span></label>
        <fieldset className="supplier-choice"><legend>허용할 공급업체 <span className="required-label">한 곳 이상</span></legend>{data.suppliers.map((supplier) => <label className="supplier-option" key={supplier.id}><input type="checkbox" checked={supplierIds.includes(supplier.id)} onChange={() => toggleSupplier(supplier.id)} /><span><strong>{supplier.name}</strong><small>예시 배송비 {won(supplier.deliveryFee)}</small></span><span className="checkbox-custom" /></label>)}</fieldset>
        <label className="form-row form-row-stack"><span className="field-label">승인 만료 시각 <span className="required-label">필수</span></span><input data-testid="policy-expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required /><span className="field-hint">지정한 만료 시각부터 새 발주를 차단합니다.</span></label>
        {message && <InlineAlert tone={message.includes("하지 못했습니다") || message.includes("할 수 없습니다") || message.includes("확인하세요") ? "danger" : "success"}>{message}</InlineAlert>}
        <button className="button button-primary" data-testid="approve-policy" type="submit" disabled={busy}><ShieldCheck size={16} />{busy ? "승인 중…" : "정책 저장 및 승인"}</button>
      </form>
      <aside className="panel current-policy">
        <div className="panel-heading"><div><p className="eyebrow">2 — CURRENT RULE</p><h3>현재 승인 내역</h3></div><CircleHelp size={17} className="muted-icon" /></div>
        {selectedPolicy ? <>
          <div className="policy-heading-status"><div><strong>{branches.find((branch) => branch.branchId === selectedBranch)?.displayName}</strong><span>정책 v{selectedPolicy.version}</span></div><span className={`policy-state ${selectedPolicy.active ? "policy-active" : "policy-stopped"}`}><span className={`live-dot ${selectedPolicy.active ? "dot-green" : "dot-red"}`} />{selectedPolicy.active ? "활성" : "중단"}</span></div>
          <div className="current-rule"><div><span>사용 금액</span><strong>{won(selectedPolicy.spent)}</strong></div><div><span>승인 한도</span><strong>{won(selectedPolicy.budget)}</strong></div><div><span>잔여 한도</span><strong>{won(Math.max(0, selectedPolicy.budget - selectedPolicy.spent))}</strong></div><div><span>승인 만료</span><strong>{koreanDate(selectedPolicy.expiresAt)}</strong></div><div><span>허용 공급업체</span><strong>{selectedPolicy.supplierIds.map((id) => data.suppliers.find((item) => item.id === id)?.name ?? id).join(" · ")}</strong></div></div>
          {selectedPolicy.active ? <button className="button button-danger-outline" data-testid="stop-agent" onClick={() => setStopBranch(selectedBranch)} disabled={busy}><ShieldAlert size={16} />이 가맹점 에이전트 중단</button> : <button className="button button-outline" onClick={() => { setBudget(String(selectedPolicy.budget)); setSupplierIds(selectedPolicy.supplierIds); setMessage("승인 양식을 수정한 뒤 다시 저장하면 정책을 재개합니다."); }}><RotateCcw size={15} />정책 재승인 양식 불러오기</button>}
          <p className="subtle-note"><History size={14} />승인 또는 중단 변경은 감사 기록에 남습니다. 모의 체인에서는 실제 트랜잭션이 생성되지 않습니다.</p>
        </> : <EmptyState title="선택한 정책이 없습니다" description="승인하려면 왼쪽 양식을 채우세요." />}
      </aside>
    </section>
    {stopBranch && <Modal title="에이전트 지출 중단" onClose={() => setStopBranch(null)}><p className="modal-copy">이 가맹점의 이후 발주를 차단합니다. 이미 체인에서 확정된 거래에는 적용되지 않습니다.</p><div className="modal-highlight"><strong>{branches.find((branch) => branch.branchId === stopBranch)?.displayName}</strong><span>{data.chainMode === "simulated" ? "시뮬레이션 기록" : "프라이빗 체인에서 확정"}</span></div><div className="modal-actions"><button className="button button-outline" onClick={() => setStopBranch(null)}>돌아가기</button><button className="button button-danger" data-testid="confirm-stop" disabled={busy} onClick={() => void stopAgent()}><ShieldAlert size={15} />지출 중단 확정</button></div></Modal>}
  </div>;
}
