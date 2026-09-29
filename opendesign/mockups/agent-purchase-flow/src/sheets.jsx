import React, {useEffect, useRef, useState} from 'react';
import {ArrowRight, Check, ExternalLink, Info, ShieldCheck, X} from 'lucide-react';
import {quoteFor} from './quote.js';

export function Sheet({name,m,draft,setDraft,requestDraft,setRequestDraft,answer,setAnswer,error,cash,close,saveConditions,saveRequest,sendAnswer,approveConstraints,approveQuote,cancelRun}) {
  const run = m.run;
  const quote = quoteFor(run);
  const [confirmed,setConfirmed] = useState(false);
  const closeButton = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    closeButton.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const elements = [...document.querySelectorAll('.bottom-sheet button:not(:disabled),.bottom-sheet input,.bottom-sheet textarea')];
      const first = elements[0], last = elements[elements.length-1];
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (opener?.isConnected) opener.focus(); };
  }, []);
  const set = (key,value) => setDraft(current => ({...current,[key]:value}));
  const setRequest = (key,value) => setRequestDraft(current => ({...current,[key]:value}));
  return <div className="sheet-layer"><button className="sheet-backdrop" onClick={close} aria-label="닫기"/><section className="bottom-sheet" role="dialog" aria-modal="true" aria-label={name==='conditions'?'요청 조건 설정':name==='answer'?'추가 정보 입력':name==='edit'?'요청 수정':name==='constraints'?'조건 승인':name==='evidence'?'상품 근거':name==='quote'?'모의 주문 승인':'요청 취소'}><div className="sheet-handle"/><header className="sheet-header"><strong>{name==='conditions'?'이번 요청의 조건':name==='answer'?'추가 정보':name==='edit'?'요청 수정':name==='constraints'?'구매 조건 확인':name==='evidence'?'상품 근거':name==='quote'?'최종 모의 주문 확인':'요청 관리'}</strong><button ref={closeButton} onClick={close} aria-label="시트 닫기"><X size={20}/></button></header>
    <div className="sheet-body">
      {name==='conditions' && <><p className="sheet-lead">필요한 조건만 정해 주세요. 요청 문장은 시작 화면에서 입력합니다.</p><span className="field-label">진행 방식</span><div className="choice-grid"><button className={draft.track==='Plan'?'chosen':''} onClick={()=>set('track','Plan')}><strong>함께 계획</strong><small>대화하며 조건 정하기</small></button><button className={draft.track==='HardInput'?'chosen':''} onClick={()=>set('track','HardInput')}><strong>조건 고정</strong><small>정해 둔 조건만 사용</small></button></div><div className="sheet-fields"><label>최대 금액 · 원<input inputMode="numeric" placeholder="선택 사항" value={draft.maxTotal} onChange={e=>set('maxTotal',e.target.value.replace(/\D/g,''))}/></label><label>수량<input inputMode="numeric" placeholder="선택 사항" value={draft.quantity} onChange={e=>set('quantity',e.target.value.replace(/\D/g,''))}/></label><label>정확한 상품명<input placeholder="선택 사항" value={draft.requiredName} onChange={e=>set('requiredName',e.target.value)}/></label></div><label className="switch-line"><input type="checkbox" checked={draft.auto} onChange={e=>set('auto',e.target.checked)}/><span><strong>조건 충족 시 모의 주문 자동 확정</strong><small>조건 고정·금액·수량·상품명 모두 필요</small></span></label><p className="fine-print">실제 결제·배송은 발생하지 않습니다.</p></>}
      {name==='answer' && <><div className="sheet-question"><Info size={21}/><div><strong>몇 개가 필요하세요?</strong><p>수량을 알려주시면 조건 검토를 이어갈게요.</p></div></div><label className="single-field">필요한 수량<input autoFocus inputMode="numeric" placeholder="예: 1" value={answer} onChange={e=>setAnswer(e.target.value.replace(/\D/g,''))}/></label></>}
      {name==='edit' && requestDraft && <><p className="sheet-lead">내용을 바꾸면 조건 검토를 처음부터 다시 진행합니다.</p><div className="sheet-fields"><label>요청 내용<textarea value={requestDraft.query} maxLength={600} onChange={e=>setRequest('query',e.target.value)}/></label><label>최대 금액 · 원<input inputMode="numeric" value={requestDraft.maxTotal} onChange={e=>setRequest('maxTotal',e.target.value.replace(/\D/g,''))}/></label><label>수량<input inputMode="numeric" value={requestDraft.quantity} onChange={e=>setRequest('quantity',e.target.value.replace(/\D/g,''))}/></label><label>정확한 상품명<input value={requestDraft.requiredName} onChange={e=>setRequest('requiredName',e.target.value)}/></label></div><p className="fine-print">자동 확정 옵션은 수정 시 해제됩니다.</p></>}
      {name==='constraints' && <><p className="sheet-lead">에이전트가 정리한 내용을 확인해 주세요.</p><div className="review-list"><div><span>요청</span><strong>{run.query}</strong></div><div><span>최대 금액</span><strong>{cash(run.maxTotal)}</strong></div><div><span>수량</span><strong>{run.quantity}개</strong></div><div><span>정책 버전</span><strong>v{run.policyVersion}</strong></div></div><div className="approval-note"><ShieldCheck size={20}/><span>예시 판정: 현재 모의 정책의 금액·수량 범위에 있습니다.</span></div><label className="check-line"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>조건과 판정 내용을 확인했습니다.</span></label></>}
      {name==='evidence' && <><span className="evidence-thumb"><ExternalLink size={27}/></span><h2>{run.requiredName || '요청에 맞는 상품 후보'}</h2><p className="sheet-lead">화면 흐름을 확인하기 위한 예시 상품입니다.</p><div className="review-list"><div><span>판매처</span><strong>예시 판매처</strong></div><div><span>상품 단가</span><strong>{cash(quote.unitPrice)}</strong></div><div><span>배송비</span><strong>{cash(quote.shipping)}</strong></div><div><span>수량</span><strong>{quote.quantity}개</strong></div><div><span>합계</span><strong>{cash(quote.total)}</strong></div></div><div className="approval-note"><Info size={20}/><span>실제 판매 페이지를 조회하지 않았으므로 원문 링크와 검증 시각은 제공하지 않습니다.</span></div></>}
      {name==='quote' && <><div className="quote-banner"><span>모의 주문 합계</span><strong>{cash(quote.total)}</strong></div><div className="review-list"><div><span>품목</span><strong>{run.requiredName || '요청에 맞는 상품 후보'}</strong></div><div><span>수량</span><strong>{quote.quantity}개</strong></div><div><span>상품 금액</span><strong>{cash(quote.unitPrice)} × {quote.quantity}</strong></div><div><span>배송비</span><strong>{cash(quote.shipping)}</strong></div><div><span>정책 버전</span><strong>v{run.policyVersion}</strong></div></div><div className="approval-note"><Info size={20}/><span>예시 견적입니다. 이 버튼은 모의 기록만 생성하며 실제 결제를 실행하지 않습니다.</span></div><label className="check-line"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>품목·수량·합계와 모의 주문 여부를 확인했습니다.</span></label></>}
      {name==='cancel' && <><div className="sheet-question"><Info size={21}/><div><strong>이 요청을 취소할까요?</strong><p>현재 모의 작업을 중단하고 기록에 취소 상태로 남깁니다.</p></div></div></>}
      {error && <p className="input-error" role="alert">{error}</p>}
    </div>
    <footer className="sheet-footer">
      {name==='conditions' && <button className="primary-btn" onClick={saveConditions}>조건 적용 <ArrowRight size={18}/></button>}
      {name==='answer' && <button className="primary-btn" onClick={sendAnswer}>이 내용으로 계속하기 <ArrowRight size={18}/></button>}
      {name==='edit' && <button className="primary-btn" onClick={saveRequest}>수정하고 다시 확인 <ArrowRight size={18}/></button>}
      {name==='constraints' && <button className="primary-btn" disabled={!confirmed} onClick={approveConstraints}>조건 승인하고 계속하기 <Check size={18}/></button>}
      {name==='evidence' && <button className="secondary-btn" onClick={close}>작업 화면으로 돌아가기</button>}
      {name==='quote' && <button className="primary-btn" disabled={!confirmed} onClick={approveQuote}>모의 주문 승인 <Check size={18}/></button>}
      {name==='cancel' && <><button className="danger-btn" onClick={cancelRun}>요청 취소</button><button className="secondary-btn" onClick={close}>계속 진행</button></>}
    </footer>
  </section></div>;
}
