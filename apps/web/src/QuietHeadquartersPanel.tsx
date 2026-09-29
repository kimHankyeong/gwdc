import { useState } from "react";
import { Check, ChevronRight, PauseCircle, ShieldCheck } from "lucide-react";
import { DEMO_USERS, type Policy } from "@franchise/shared";
import { api, type Bootstrap } from "./api.js";
import { InlineAlert, Modal, StatusPill, koreanDate, won } from "./Visual.js";

type Props = { data: Bootstrap; mode: "overview" | "policy"; refresh: () => Promise<void>; notice: (message: string) => void };

export function QuietHeadquartersPanel({ data, mode, refresh, notice }: Props) {
  const branches = DEMO_USERS.filter((user) => user.role === "BRANCH");
  const policies = data.policies ?? [];
  const orders = data.orders ?? [];
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.branchId ?? "branch-01");
  const selectedPolicy = policies.find((policy) => policy.branchId === selectedBranch) ?? null;
  const [supplierIds, setSupplierIds] = useState<string[]>(selectedPolicy?.supplierIds ?? []);
  const [budget, setBudget] = useState(String(selectedPolicy?.budget ?? 200_000));
  const [expiresAt, setExpiresAt] = useState(() => selectedPolicy?.expiresAt ? new Date(selectedPolicy.expiresAt).toISOString().slice(0, 16) : new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [stopBranch, setStopBranch] = useState<string | null>(null);

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
      setMessage(`정책 v${result.policy.version}이 활성화되었습니다.`);
      notice("구매 정책을 저장했습니다.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "정책을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  };

  const stopAgent = async () => {
    if (!stopBranch) return;
    setBusy(true);
    try {
      await api(`/api/policies/${encodeURIComponent(stopBranch)}/stop`, { method: "POST" });
      notice("구매 정책을 중단했습니다.");
      setStopBranch(null);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "중단 요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  };

  if (mode === "overview") {
    const totalBudget = policies.reduce((sum, policy) => sum + policy.budget, 0);
    const totalSpent = policies.reduce((sum, policy) => sum + policy.spent, 0);
    const blocked = orders.filter((order) => order.status === "blocked").length;
    return <div className="quiet-page">
      <section className="quiet-hero">
        <p>운영</p>
        <h1>{blocked > 0 ? `${blocked}건을 확인해주세요` : "모든 지점이 정상입니다"}</h1>
        <span>{blocked > 0 ? "정책에 의해 중단된 구매 요청이 있습니다." : "현재 별도로 처리할 항목이 없습니다."}</span>
      </section>

      <section className="quiet-metrics" aria-label="운영 요약">
        <div><span>전체 예산</span><strong>{won(totalBudget)}</strong></div>
        <div><span>사용액</span><strong>{won(totalSpent)}</strong></div>
        <div><span>구매 요청</span><strong>{orders.length}건</strong></div>
      </section>

      <section className="quiet-section">
        <header><h2>가맹점</h2><span>{policies.length}곳</span></header>
        <div className="quiet-list">
          {policies.map((policy) => {
            const branch = branches.find((item) => item.branchId === policy.branchId);
            return <details key={policy.branchId} className="quiet-row">
              <summary><span><i className={policy.active ? "status-on" : "status-off"} /><strong>{branch?.displayName ?? policy.branchId}</strong></span><span>{won(Math.max(0, policy.budget - policy.spent))} 남음 <ChevronRight size={15} /></span></summary>
              <dl className="quiet-row-details"><div><dt>정책</dt><dd>v{policy.version} · {policy.active ? "활성" : "중단"}</dd></div><div><dt>승인 예산</dt><dd>{won(policy.budget)}</dd></div><div><dt>사용액</dt><dd>{won(policy.spent)}</dd></div><div><dt>만료</dt><dd>{koreanDate(policy.expiresAt)}</dd></div></dl>
            </details>;
          })}
        </div>
      </section>

      {orders.length > 0 && <details className="quiet-details activity-details"><summary>최근 구매 기록 {Math.min(orders.length, 5)}건 보기</summary><div className="quiet-activity-list">{orders.slice(0, 5).map((order) => <div key={order.id}><span>{branches.find((branch) => branch.branchId === order.branchId)?.displayName ?? order.branchId}</span><StatusPill status={order.status} /><strong>{order.total === undefined ? "—" : won(order.total)}</strong></div>)}</div></details>}
    </div>;
  }

  return <div className="quiet-page policy-page">
    <section className="quiet-hero compact">
      <p>정책</p>
      <h1>구매 정책을 정합니다</h1>
      <span>자주 확인하는 조건만 먼저 보여드립니다.</span>
    </section>

    <div className="quiet-policy-layout">
      <form className="quiet-policy-form" onSubmit={(event) => void savePolicy(event)}>
        <label className="quiet-field"><span>가맹점</span><select value={selectedBranch} onChange={(event) => onBranchChange(event.target.value)} data-testid="policy-branch">{branches.map((branch) => <option key={branch.branchId} value={branch.branchId!}>{branch.displayName}</option>)}</select></label>
        <label className="quiet-field budget-field"><span>사용 가능한 전체 예산</span><div><input data-testid="policy-budget" type="number" min={selectedPolicy?.spent ?? 1} value={budget} onChange={(event) => setBudget(event.target.value)} required /><b>원</b></div></label>

        <details className="quiet-details form-details">
          <summary>세부 조건 {supplierIds.length + 1}개</summary>
          <fieldset className="quiet-suppliers"><legend>허용 공급업체</legend>{data.suppliers.map((supplier) => <label key={supplier.id}><input type="checkbox" checked={supplierIds.includes(supplier.id)} onChange={() => toggleSupplier(supplier.id)} /><span><strong>{supplier.name}</strong><small>배송비 {won(supplier.deliveryFee)}</small></span></label>)}</fieldset>
          <label className="quiet-field"><span>정책 만료</span><input data-testid="policy-expires" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required /></label>
        </details>

        {message && <InlineAlert tone={message.includes("못했습니다") || message.includes("선택") || message.includes("정수") ? "danger" : "success"}>{message}</InlineAlert>}
        <button className="quiet-primary" data-testid="approve-policy" type="submit" disabled={busy}><ShieldCheck size={16} />{busy ? "저장 중…" : "정책 검토 후 저장"}</button>
      </form>

      <aside className="quiet-current-policy">
        <span>현재 적용 중</span>
        {selectedPolicy ? <>
          <div className="current-policy-title"><strong>정책 v{selectedPolicy.version}</strong><i className={selectedPolicy.active ? "status-on" : "status-off"}>{selectedPolicy.active ? "활성" : "중단"}</i></div>
          <strong className="current-policy-budget">{won(selectedPolicy.budget - selectedPolicy.spent)}</strong><small>남은 예산</small>
          <details className="quiet-details"><summary>전체 정책 보기</summary><dl className="quiet-row-details"><div><dt>승인 예산</dt><dd>{won(selectedPolicy.budget)}</dd></div><div><dt>사용액</dt><dd>{won(selectedPolicy.spent)}</dd></div><div><dt>공급업체</dt><dd>{selectedPolicy.supplierIds.map((id) => data.suppliers.find((supplier) => supplier.id === id)?.name ?? id).join(", ")}</dd></div><div><dt>만료</dt><dd>{koreanDate(selectedPolicy.expiresAt)}</dd></div></dl></details>
          {selectedPolicy.active && <button className="quiet-danger-link" type="button" onClick={() => setStopBranch(selectedBranch)}><PauseCircle size={15} />정책 중단</button>}
        </> : <p>아직 활성 정책이 없습니다.</p>}
      </aside>
    </div>

    {stopBranch && <Modal title="구매 정책을 중단할까요?" onClose={() => setStopBranch(null)}><p className="modal-copy">이 가맹점의 새로운 구매 요청이 중단됩니다.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setStopBranch(null)}>돌아가기</button><button className="button button-danger" data-testid="confirm-stop" disabled={busy} onClick={() => void stopAgent()}><Check size={15} />중단하기</button></div></Modal>}
  </div>;
}
