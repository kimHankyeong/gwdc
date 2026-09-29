import { useMemo, useState } from "react";
import { ArrowRight, Minus, Plus, RotateCcw } from "lucide-react";
import type { PurchaseRecord } from "@franchise/shared";
import { api, type Bootstrap } from "./api.js";
import { InlineAlert, won } from "./Visual.js";

type Props = { data: Bootstrap; refresh: () => Promise<void>; onOrder: (purchase: PurchaseRecord) => void; selectedOrder: PurchaseRecord | null };

export function QuietOrdersPanel({ data, refresh, onOrder }: Props) {
  const user = data.user!;
  const branchId = user.branchId!;
  const policy = data.policies?.find((item) => item.branchId === branchId) ?? null;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [provider, setProvider] = useState<"codex" | "claude" | "demo">(data.defaultProvider ?? "codex");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remaining = policy ? Math.max(0, policy.budget - policy.spent) : 0;
  const valid = Boolean(policy?.active && Date.parse(policy.expiresAt) > Date.now());
  const selectedLines = useMemo(() => data.catalog.filter((item) => (quantities[item.id] ?? 0) > 0), [data.catalog, quantities]);
  const estimated = selectedLines.reduce((sum, item) => sum + item.price * quantities[item.id]!, 0);

  const updateQuantity = (itemId: string, value: number) => setQuantities((current) => ({ ...current, [itemId]: Math.max(0, value) }));

  const submit = async () => {
    setError("");
    if (!valid || selectedLines.length === 0 || busy) return;
    setBusy(true);
    try {
      const response = await api<{ purchase: PurchaseRecord }>("/api/orders", { method: "POST", body: JSON.stringify({
        branchId,
        idempotencyKey: crypto.randomUUID(),
        provider,
        needs: selectedLines.map((item) => ({ itemId: item.id, quantity: quantities[item.id]! })),
      }) });
      onOrder(response.purchase);
      await refresh();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "구매 요청을 접수하지 못했습니다."); }
    finally { setBusy(false); }
  };

  return <div className="quiet-page order-page">
    <section className="quiet-hero order-hero">
      <p>{user.displayName}</p>
      <h1>무엇이 필요한가요?</h1>
      <span>필요한 수량을 선택하면 정책 안에서 구매안을 만듭니다.</span>
    </section>

    <section className="order-composer">
      <div className="order-budget"><span>현재 사용 가능</span><strong>{won(remaining)}</strong><i className={valid ? "status-on" : "status-off"}>{valid ? "정책 적용 중" : "구매 중단"}</i></div>

      {!valid && <InlineAlert tone="danger">현재 정책으로는 새로운 구매를 요청할 수 없습니다.</InlineAlert>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      <details className="item-picker" open={selectedLines.length === 0}>
        <summary><span>{selectedLines.length === 0 ? "품목 선택하기" : `${selectedLines.length}개 품목 선택됨`}</span><small>{selectedLines.length === 0 ? "필수" : won(estimated)}</small></summary>
        <div className="item-list">
          {data.catalog.map((item) => {
            const quantity = quantities[item.id] ?? 0;
            return <div className={quantity > 0 ? "item-row is-selected" : "item-row"} key={item.id}>
              <div><strong>{item.name}</strong><span>{item.unit} · {won(item.price)}</span></div>
              <div className="stepper" aria-label={`${item.name} 수량`}>
                <button type="button" aria-label={`${item.name} 수량 줄이기`} onClick={() => updateQuantity(item.id, quantity - 1)} disabled={quantity === 0}><Minus size={14} /></button>
                <input data-testid={`qty-${item.id}`} aria-label={`${item.name} 수량`} type="number" min="0" max="10000" value={quantity} onChange={(event) => updateQuantity(item.id, Number(event.target.value) || 0)} />
                <button type="button" aria-label={`${item.name} 수량 늘리기`} onClick={() => updateQuantity(item.id, quantity + 1)}><Plus size={14} /></button>
              </div>
            </div>;
          })}
        </div>
      </details>

      {selectedLines.length > 0 && <div className="selection-summary">
        <div>{selectedLines.map((item) => <span key={item.id}>{item.name} {quantities[item.id]}{item.unit}</span>)}</div>
        <strong>예상 소계 {won(estimated)}</strong>
      </div>}

      {estimated > remaining && <InlineAlert tone="notice">예상 금액이 현재 잔액을 넘습니다. 최종 금액은 배송비를 포함해 다시 검사합니다.</InlineAlert>}

      <details className="quiet-details form-details">
        <summary>세부 설정</summary>
        <label className="quiet-field"><span>구매안 생성 방식</span><select id="provider-select" data-testid="provider-select" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="codex">Codex CLI</option><option value="claude">Claude CLI</option><option value="demo">명시적 데모</option></select></label>
        <p className="quiet-help">생성 방식은 구매 후보를 고르는 데만 사용되며, 예산과 허용 공급업체는 서버에서 다시 검사합니다.</p>
      </details>

      <div className="composer-actions">
        {selectedLines.length > 0 && <button className="quiet-reset" type="button" onClick={() => setQuantities({})}><RotateCcw size={14} />비우기</button>}
        <button className="quiet-primary" data-testid="submit-order" type="button" onClick={() => void submit()} disabled={!valid || selectedLines.length === 0 || busy}>{busy ? "구매안 만드는 중…" : "구매안 만들기"}<ArrowRight size={16} /></button>
      </div>
    </section>

    <details className="quiet-details policy-peek">
      <summary>적용 중인 구매 규칙</summary>
      {policy ? <dl className="quiet-row-details"><div><dt>정책 버전</dt><dd>v{policy.version}</dd></div><div><dt>허용 공급업체</dt><dd>{policy.supplierIds.map((id) => data.suppliers.find((supplier) => supplier.id === id)?.name ?? id).join(", ")}</dd></div><div><dt>전체 예산</dt><dd>{won(policy.budget)}</dd></div><div><dt>현재 사용액</dt><dd>{won(policy.spent)}</dd></div></dl> : <p>활성 정책이 없습니다.</p>}
    </details>
  </div>;
}
