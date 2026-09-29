import React, {useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardCheck, Clock3, FileText, Info, MoreHorizontal, Search, ShieldCheck, Sparkles, Wallet} from 'lucide-react';
import {quoteFor} from './quote.js';

const phaseText = {
  working:'요청을 살펴보는 중', needInput:'추가 정보 필요', needConstraints:'조건 검토 필요',
  searching:'상품 근거를 찾는 중', needQuote:'최종 확인 필요', auditPending:'모의 주문 처리 중',
  done:'모의 주문 완료', canceled:'취소됨'
};
const working = run => ['working','searching','auditPending'].includes(run?.phase);

export function HomeScreen({m,setM,openSheet,begin,go,error}) {
  const inProgress = m.run && !['done','canceled'].includes(m.run.phase);
  return <div className="screen home-screen">
    <header className="home-header"><div className="brand-mark"><Sparkles size={18}/></div><strong>구매 에이전트</strong><span className="demo-chip">모의 앱</span></header>
    <div className="home-intro"><span className="eyebrow">AI PURCHASE ASSISTANT</span><h1>무엇을 대신<br/>찾아볼까요?</h1><p>원하는 것과 꼭 지킬 조건을 편하게 적어주세요.</p></div>
    {inProgress ? <button className="active-request" onClick={() => go('agent')}><span className="active-pulse"/><span><small>진행 중인 요청</small><strong>{m.run.query}</strong><em>{phaseText[m.run.phase]}</em></span><ChevronRight size={20}/></button>
      : <div className="composer-card"><label htmlFor="query" className="composer-label">새 요청</label><textarea id="query" placeholder="예: 사무실에서 쓸 조용한 키보드를 찾아줘" value={m.query} onChange={e => setM(current => ({...current, query:e.target.value}))} maxLength={600}/>{error && <p className="input-error" role="alert">{error}</p>}<div className="composer-actions"><button className="text-action" onClick={() => openSheet('conditions')}>조건 설정 <ChevronRight size={16}/></button><button className="circle-cta" onClick={begin} aria-label="에이전트 시작"><ArrowRight size={22}/></button></div></div>}
    <section className="home-summary"><div className="summary-icon"><ShieldCheck size={23}/></div><div><small>현재 구매 정책 · v{m.policy.version}</small><strong>1회 한도 {Number(m.policy.perTransaction).toLocaleString('ko-KR')}원</strong></div><button onClick={() => go('my')} aria-label="정책 보기"><ChevronRight size={18}/></button></section>
    <div className="home-footnote"><Info size={15}/><span>실제 결제·배송은 발생하지 않습니다.</span></div>
  </div>;
}

function Activity({run}) {
  const lines = [
    ['요청 접수', true],
    ['정책 v'+run.policyVersion+' 확인', run.stage >= 1 || run.phase !== 'working'],
    ['요청 조건 정리', run.stage >= 2 || !['working','needInput'].includes(run.phase)],
    ['상품 근거 확인', ['needQuote','auditPending','done'].includes(run.phase)],
    ['모의 주문 기록', run.phase === 'done']
  ];
  return <div className="activity-list">{lines.map(([text,done],i) => <div className={'activity-row '+(done?'done':'')} key={i}><span className="activity-dot">{done ? <Check size={12}/> : ''}</span><span>{text}</span>{i===lines.length-1 && run.phase==='done' && <small>완료</small>}</div>)}</div>;
}

export function AgentScreen({run,go,openSheet,cash}) {
  if (!run) return <div className="screen"><button className="back-link" onClick={() => go('home')}><ArrowLeft size={19}/> 시작으로</button><p>진행 중인 요청이 없습니다.</p></div>;
  const canCancel = !['done','canceled','auditPending'].includes(run.phase);
  const showCandidate = ['needQuote','auditPending','done'].includes(run.phase);
  const quote = quoteFor(run);
  return <div className="screen agent-screen">
    <header className="detail-header"><button onClick={() => go('home')} aria-label="시작 화면으로"><ArrowLeft size={22}/></button><strong>구매 에이전트</strong><button onClick={() => canCancel ? openSheet('cancel') : go('history')} aria-label={canCancel?'요청 관리':'기록 보기'}><MoreHorizontal size={22}/></button></header>
    <div className="agent-scroll">
      <div className="run-intro"><span className="eyebrow">진행 중인 요청 · {run.createdAt}</span><h1>{run.query}</h1><span className={'status-pill '+(working(run)?'live':'')}>{working(run) && <span className="pulse-mini"/>}{phaseText[run.phase]}</span></div>
      <div className="stage-row"><span className="complete">요청 이해</span><span className={run.phase==='working'?'current':'complete'}>조건 확인</span><span className={['searching','needQuote','auditPending','done'].includes(run.phase)?'current':''}>상품 근거</span></div>
      {working(run) && <div className="thinking-card"><div className="thinking-icon"><Sparkles size={21}/></div><div><strong>{run.phase==='working'?'요청과 정책을 확인하고 있어요':run.phase==='searching'?'확인 가능한 상품 정보를 살펴보고 있어요':'모의 주문 결과를 기록하고 있어요'}</strong><p>이 화면은 모의 작업 상태입니다. 결과가 나오면 이곳에 표시됩니다.</p><div className="thinking-bar"><i/></div></div></div>}
      <div className="conversation"><div className="conversation-label">작업 기록</div><div className="message user-message"><small>내 요청</small><p>{run.query}</p></div><div className="message agent-message"><span className="message-icon"><Sparkles size={17}/></span><div><small>에이전트</small><p>현재 정책 v{run.policyVersion}을 적용해 조건을 확인합니다.</p></div></div></div>
      {run.phase==='needInput' && <div className="attention-card"><span className="attention-icon"><Info size={19}/></span><div><small>추가 확인</small><h2>몇 개가 필요하세요?</h2><p>수량을 알려주시면 조건 검토를 이어갈게요.</p></div></div>}
      {['needConstraints','searching','needQuote','auditPending','done'].includes(run.phase) && <div className="result-card"><div className="card-heading"><ClipboardCheck size={21}/><strong>구매 조건</strong><span>확인됨</span></div><div className="mini-facts"><span>수량 <b>{run.quantity}개</b></span><span>최대 금액 <b>{cash(run.maxTotal)}</b></span><span>진행 방식 <b>{run.track==='Plan'?'함께 계획':'조건 고정'}</b></span></div>{run.phase==='needConstraints' && <p className="card-hint">정책 범위와 조건을 확인한 뒤 승인해 주세요.</p>}</div>}
      {showCandidate && <div className="candidate-block"><div className="section-title"><h2>확인한 후보</h2><span>예시 데이터</span></div><button className="candidate-card" onClick={() => openSheet('evidence')}><div className="candidate-thumb"><Search size={27}/></div><div><strong>{run.requiredName || '요청에 맞는 상품 후보'}</strong><small>예시 판매처 · 가격 근거 보기</small><b>{cash(quote.unitPrice)} <span>+ 배송비 {cash(quote.shipping)}</span></b></div><ChevronRight size={18}/></button></div>}
      {run.phase==='done' && <div className="done-card"><span><Check size={21}/></span><div><strong>모의 주문이 완료됐어요</strong><p>실제 결제·배송 없이 기록만 생성됐습니다.</p></div></div>}
      {run.phase==='canceled' && <div className="attention-card"><Info size={20}/><div><h2>요청을 취소했습니다</h2><p>새 요청은 시작 화면에서 만들 수 있습니다.</p></div></div>}
      <details className="timeline-details"><summary><Clock3 size={17}/> 작업 단계 보기</summary><Activity run={run}/></details>
    </div>
    <footer className="sticky-actions">
      {run.phase==='needInput' && <><button className="secondary-btn" onClick={() => openSheet('edit')}>요청 수정</button><button className="primary-btn" onClick={() => openSheet('answer')}>수량 알려주기 <ArrowRight size={18}/></button></>}
      {run.phase==='needConstraints' && <><button className="secondary-btn" onClick={() => openSheet('edit')}>요청 수정</button><button className="primary-btn" onClick={() => openSheet('constraints')}>조건과 판정 확인 <ArrowRight size={18}/></button></>}
      {run.phase==='needQuote' && <button className="primary-btn" onClick={() => openSheet('quote')}>최종 모의 주문 확인 <ArrowRight size={18}/></button>}
      {run.phase==='done' && <button className="primary-btn" onClick={() => go('receipt')}>영수증 보기 <ArrowRight size={18}/></button>}
      {run.phase==='canceled' && <button className="primary-btn" onClick={() => go('home')}>새 요청 만들기 <ArrowRight size={18}/></button>}
      {working(run) && <div className="progress-note"><span className="pulse-mini"/> 작업이 끝나면 이 화면이 갱신됩니다</div>}
    </footer>
  </div>;
}

export function HistoryScreen({m,openRecord}) {
  const [filter,setFilter] = useState('전체');
  const current = m.run && !['done','canceled'].includes(m.run.phase) ? [m.run] : [];
  const items = [...current, ...m.records.filter(x => !current.some(c => c.id===x.id))];
  const visible = items.filter(item => filter==='전체' || (filter==='진행 중' ? !['done','canceled'].includes(item.phase) : ['done','canceled'].includes(item.phase)));
  return <div className="screen list-screen"><div className="simple-header"><span className="eyebrow">MY ACTIVITY</span><h1>기록</h1><p>요청부터 모의 주문 결과까지 한곳에서 봅니다.</p></div><div className="filter-row">{['전체','진행 중','완료'].map(v => <button key={v} className={filter===v?'active':''} onClick={() => setFilter(v)}>{v}</button>)}</div><div className="record-list">{visible.length ? visible.map(item => <button className="record-item" key={item.id} onClick={() => openRecord(item)}><span className="record-icon">{item.phase==='done'?<FileText size={21}/>:<Sparkles size={21}/>}</span><span><strong>{item.query}</strong><small>{item.createdAt} · {phaseText[item.phase]}</small></span><ChevronRight size={18}/></button>) : <div className="empty-state"><HistoryIcon/><h2>{filter==='전체'?'아직 요청이 없어요':'해당하는 기록이 없어요'}</h2><p>새 구매 요청을 시작하면 여기에 모입니다.</p></div>}</div></div>;
}
function HistoryIcon(){return <Clock3 size={28}/>;}

export function MyScreen({m,openPolicy,reset,cash}) {
  const [panel,setPanel] = useState(null);
  return <div className="screen list-screen"><div className="simple-header"><span className="eyebrow">MY SPACE</span><h1>내 정보</h1><p>구매 기준과 모의 감사 환경을 관리합니다.</p></div>
    <section className="my-policy"><div className="my-policy-top"><span className="policy-glyph"><ShieldCheck size={23}/></span><span>구매 정책 · v{m.policy.version}</span></div><strong>1회 한도 {cash(m.policy.perTransaction)}</strong><p>모의 잔고 {cash(m.policy.remaining)}</p><button onClick={openPolicy}>정책 보기·변경 <ArrowRight size={16}/></button></section>
    <div className="menu-group"><button onClick={() => setPanel(panel==='audit'?null:'audit')}><Wallet size={20}/><span>지갑·감사 연결 상태</span><ChevronRight size={18}/></button>{panel==='audit' && <div className="menu-detail"><strong>Sepolia · 모의 환경</strong><p>이 프로토타입에는 실제 지갑이나 감사 트랜잭션이 연결되지 않습니다.</p></div>}<button onClick={() => setPanel(panel==='about'?null:'about')}><Info size={20}/><span>앱 안내</span><ChevronRight size={18}/></button>{panel==='about' && <div className="menu-detail"><strong>구매 에이전트 모의 앱</strong><p>검색·가격·승인·감사 상태는 화면 흐름을 보여주는 예시입니다.</p></div>}</div>
    <button className="my-reset" onClick={reset}>모의 앱 처음부터 다시 보기</button>
  </div>;
}

export function PolicyScreen({policy,go,save,error,cash}) {
  const [values,setValues] = useState({budget:String(policy.budget),perTransaction:String(policy.perTransaction)});
  const [confirmed,setConfirmed] = useState(false);
  const set = (key,value) => setValues(current => ({...current,[key]:value}));
  return <div className="screen policy-screen"><header className="detail-header"><button onClick={() => go('my')} aria-label="내 정보로"><ArrowLeft size={22}/></button><strong>구매 정책</strong><span className="header-spacer"/></header><div className="policy-scroll"><span className="eyebrow">POLICY VERSION {policy.version+1}</span><h1>구매 기준을<br/>확인해 주세요</h1><p className="subcopy">변경하면 새 정책 버전으로 모의 발행합니다.</p><div className="form-panel"><label>누적 예산 한도 · 원<input inputMode="numeric" value={values.budget} onChange={e=>set('budget',e.target.value.replace(/\D/g,''))}/></label><label>1회 거래 한도 · 원<input inputMode="numeric" value={values.perTransaction} onChange={e=>set('perTransaction',e.target.value.replace(/\D/g,''))}/></label><div className="policy-preview"><strong>현재 버전 v{policy.version}</strong><span>예산 {cash(policy.budget)} · 1회 {cash(policy.perTransaction)}</span></div></div>{error && <p className="input-error" role="alert">{error}</p>}<label className="check-line"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>변경 내용을 확인했으며 새 버전 발행에 동의합니다.</span></label><p className="demo-disclosure">모의 앱의 정책값만 바뀌며 실제 서버에는 저장되지 않습니다.</p></div><footer className="sticky-actions"><button className="primary-btn" disabled={!confirmed || !values.budget || !values.perTransaction} onClick={() => save(values)}>정책 v{policy.version+1} 모의 발행 <ArrowRight size={18}/></button></footer></div>;
}

export function ReceiptScreen({run,go,cash}) {
  if (!run) return <div className="screen"><button className="back-link" onClick={() => go('history')}>기록으로</button><p>영수증이 없습니다.</p></div>;
  const quote = quoteFor(run);
  return <div className="screen receipt-screen"><header className="detail-header"><button onClick={() => go('history')} aria-label="기록으로"><ArrowLeft size={22}/></button><strong>모의 영수증</strong><span className="header-spacer"/></header><div className="receipt-scroll"><div className="receipt-success"><span><Check size={28}/></span><p>모의 주문 완료</p><h1>{cash(quote.total)}</h1><small>실제 결제·배송은 발생하지 않았습니다.</small></div><div className="receipt-paper"><div><span>요청</span><strong>{run.query}</strong></div><div><span>수량</span><strong>{quote.quantity}개</strong></div><div><span>상품 금액</span><strong>{cash(quote.unitPrice * quote.quantity)}</strong></div><div><span>배송비</span><strong>{cash(quote.shipping)}</strong></div><div><span>합계</span><strong>{cash(quote.total)}</strong></div><div><span>적용 정책</span><strong>v{run.policyVersion}</strong></div></div><div className="audit-info"><ShieldCheck size={20}/><div><strong>감사 상태 · 모의 완료</strong><p>이 화면에는 실제 블록체인 트랜잭션이 없습니다.</p></div></div></div><footer className="sticky-actions"><button className="secondary-btn" onClick={() => go('history')}>기록으로 돌아가기</button></footer></div>;
}
