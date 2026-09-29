import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Home, History, UserRound, Sparkles, RotateCcw} from 'lucide-react';
import {HomeScreen, AgentScreen, HistoryScreen, MyScreen, PolicyScreen, ReceiptScreen} from './screens.jsx';
import {Sheet} from './sheets.jsx';

const KEY = 'agent-purchase-flow-v1';
const active = run => run && !['done', 'canceled'].includes(run.phase);
const fresh = () => ({
  view: 'home', query: '',
  conditions: {track: 'Plan', maxTotal: '', quantity: '', requiredName: '', auto: false},
  policy: {version: 1, budget: 1000000, perTransaction: 1000000, remaining: 1000000},
  run: null, records: [], selectedRecordId: null
});
function restore() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    return data && data.policy && data.conditions ? {...fresh(), ...data} : fresh();
  } catch { return fresh(); }
}
const cash = n => `${Number(n || 0).toLocaleString('ko-KR')}원`;

function App() {
  const [m, setM] = useState(restore);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [requestDraft, setRequestDraft] = useState(null);
  const [draft, setDraft] = useState(m.conditions);

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(m)); }, [m]);
  useEffect(() => {
    window.history.replaceState({view: m.view}, '', '#'+m.view);
    const onBack = event => {
      setSheet(null);
      const view = event.state?.view;
      setM(current => ({...current, view: ['home','agent','history','my','policy','receipt'].includes(view) ? view : 'home'}));
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3300);
    return () => clearTimeout(id);
  }, [toast]);

  const run = m.run;
  useEffect(() => {
    if (!run) return;
    if (run.phase === 'working') {
      const id = setTimeout(() => setM(current => {
        if (current.run?.id !== run.id || current.run.phase !== 'working') return current;
        const next = current.run.stage + 1;
        return {...current, run: {...current.run, stage: next, phase: next >= 3 ? (current.run.quantity ? 'needConstraints' : 'needInput') : 'working'}};
      }), 850);
      return () => clearTimeout(id);
    }
    if (run.phase === 'searching') {
      const id = setTimeout(() => setM(current => {
        if (current.run?.id !== run.id || current.run.phase !== 'searching') return current;
        return {...current, run: {...current.run, phase: current.run.auto ? 'auditPending' : 'needQuote'}};
      }), 2300);
      return () => clearTimeout(id);
    }
    if (run.phase === 'auditPending') {
      const id = setTimeout(() => setM(current => {
        if (current.run?.id !== run.id || current.run.phase !== 'auditPending') return current;
        return {...current, run: {...current.run, phase: 'done'}};
      }), 2100);
      return () => clearTimeout(id);
    }
  }, [run?.id, run?.phase, run?.stage]);
  useEffect(() => {
    if (!run || !['done', 'canceled'].includes(run.phase)) return;
    setM(current => current.records.some(item => item.id === run.id)
      ? current : {...current, records: [run, ...current.records]});
  }, [run?.id, run?.phase]);

  function go(view) {
    setError(''); setSheet(null);
    window.history.pushState({view}, '', '#'+view);
    setM(current => ({...current, view, selectedRecordId: view==='agent' || view==='home' ? null : current.selectedRecordId}));
  }
  function openRecord(item) {
    const view = item.phase === 'done' ? 'receipt' : 'agent';
    window.history.pushState({view}, '', '#'+view);
    setM(current => ({...current, selectedRecordId:item.id, view}));
  }
  function openSheet(name) {
    setError('');
    if (name === 'conditions') setDraft({...m.conditions});
    if (name === 'answer') setAnswer(run?.quantity || '');
    if (name === 'edit' && run) setRequestDraft({query:run.query,maxTotal:run.maxTotal,quantity:run.quantity,requiredName:run.requiredName});
    window.history.pushState({view: m.view, sheet: name}, '', '#'+m.view+'-'+name);
    setSheet(name);
  }
  function closeSheet() {
    setError(''); setSheet(null);
    if (window.history.state?.sheet) window.history.back();
  }
  function saveConditions() {
    const limit = Number(draft.maxTotal || 0);
    if (limit && (!Number.isInteger(limit) || limit < 1 || limit > m.policy.perTransaction)) {
      setError(`최대 금액은 1원부터 ${cash(m.policy.perTransaction)}까지 입력해 주세요.`); return;
    }
    if (draft.quantity && (!Number.isInteger(Number(draft.quantity)) || Number(draft.quantity) < 1)) {
      setError('수량은 1개 이상 입력해 주세요.'); return;
    }
    if (draft.maxTotal && draft.quantity && Number(draft.maxTotal) < Number(draft.quantity)) {
      setError('최대 금액이 수량보다 작습니다.'); return;
    }
    if (draft.track === 'HardInput' && (!draft.maxTotal || !draft.quantity)) {
      setError('조건 고정에는 최대 금액과 수량이 필요합니다.'); return;
    }
    if (draft.auto && (draft.track !== 'HardInput' || !draft.maxTotal || !draft.quantity || !draft.requiredName.trim())) {
      setError('자동 확정에는 조건 고정, 금액, 수량, 정확한 상품명이 모두 필요합니다.'); return;
    }
    setM(current => ({...current, conditions: draft}));
    closeSheet(); setToast('이번 요청의 조건을 적용했습니다.');
  }
  function begin() {
    if (active(m.run)) { go('agent'); return; }
    if (!m.query.trim()) { setError('찾을 물건이나 용도를 먼저 적어 주세요.'); return; }
    const c = m.conditions;
    const next = {
      id: String(Date.now()), query: m.query.trim(), phase: 'working', stage: 0,
      track: c.track, maxTotal: c.maxTotal || String(m.policy.perTransaction),
      quantity: c.quantity, requiredName: c.requiredName, auto: c.auto,
      policyVersion: m.policy.version,
      createdAt: new Date().toLocaleString('ko-KR', {hour:'2-digit', minute:'2-digit', month:'numeric', day:'numeric'})
    };
    setM(current => ({...current, run: next, selectedRecordId:null, view: 'agent', query: ''}));
    window.history.pushState({view:'agent'}, '', '#agent');
    setError('');
  }
  function updateRun(changes) {
    setM(current => current.run ? {...current, run: {...current.run, ...changes}} : current);
  }
  function sendAnswer() {
    const count = Number(answer);
    if (!Number.isInteger(count) || count < 1) { setError('수량을 1개 이상 입력해 주세요.'); return; }
    updateRun({quantity: String(count), phase: 'working', stage: 2});
    closeSheet();
  }
  function saveRequest() {
    const d = requestDraft;
    if (!d?.query.trim()) { setError('요청 내용을 입력해 주세요.'); return; }
    const limit = Number(d.maxTotal);
    if (!Number.isInteger(limit) || limit < 1 || limit > m.policy.perTransaction) { setError('최대 금액을 정책 한도 안에서 입력해 주세요.'); return; }
    if (d.quantity && (!Number.isInteger(Number(d.quantity)) || Number(d.quantity) < 1 || limit < Number(d.quantity))) { setError('수량과 최대 금액을 확인해 주세요.'); return; }
    updateRun({...d, query:d.query.trim(), phase:'working', stage:1, auto:false});
    closeSheet(); setToast('수정한 내용으로 다시 확인합니다.');
  }
  function approveConstraints() { updateRun({phase: 'searching', stage: 0}); closeSheet(); }
  function approveQuote() { updateRun({phase: 'auditPending'}); closeSheet(); }
  function cancelRun() { updateRun({phase: 'canceled'}); closeSheet(); setToast('요청을 취소했습니다.'); }
  function openPolicy() {
    if (active(m.run)) { setToast('요청이 진행 중일 때는 정책을 변경할 수 없습니다.'); return; }
    go('policy');
  }
  function savePolicy(values) {
    const budget = Number(values.budget), per = Number(values.perTransaction);
    if (!Number.isInteger(budget) || budget < 1 || !Number.isInteger(per) || per < 1 || per > budget) {
      setError('예산과 1회 한도를 확인해 주세요.'); return false;
    }
    setM(current => ({...current, policy: {...current.policy, budget, perTransaction: per, remaining: budget, version: current.policy.version+1}}));
    go('my'); setToast('새 정책 버전을 모의 발행했습니다.'); return true;
  }
  function reset() {
    localStorage.removeItem(KEY); setM(fresh()); setSheet(null); setError('');
    window.history.pushState({view:'home'}, '', '#home');
    setToast('모의 앱을 처음 상태로 돌렸습니다.');
  }

  const tabs = [
    ['home', Home, '시작'], ['history', History, '기록'], ['my', UserRound, '내 정보']
  ];
  const displayedRun = m.selectedRecordId ? m.records.find(item => item.id===m.selectedRecordId) || m.run : m.run;
  return <div className="demo-canvas">
    <aside className="demo-aside" aria-label="모의 앱 안내">
      <div className="demo-symbol"><Sparkles size={23}/></div>
      <p className="demo-kicker">INTERACTIVE CONCEPT</p>
      <h1>AI 구매 에이전트<br/>화면 모의 구현</h1>
      <p>요청 입력부터 조건 승인, 후보 근거, 최종 모의 주문, 기록까지 눌러볼 수 있습니다.</p>
      <div className="demo-notice">화면의 가격·판매처·감사 상태는 예시 데이터입니다. 실제 검색, 결제, 블록체인 기록은 발생하지 않습니다.</div>
      <button className="reset-link" onClick={reset}><RotateCcw size={17}/> 처음부터 다시 보기</button>
    </aside>
    <div className="phone" role="application" aria-label="AI 구매 에이전트 모의 앱">
      <div className="phone-status" aria-hidden="true"><span>9:41</span><span>●●●  ▰</span></div>
      <div className="phone-screen" key={m.view}>
        {m.view === 'home' && <HomeScreen m={m} setM={setM} openSheet={openSheet} begin={begin} go={go} error={error}/>}
        {m.view === 'agent' && <AgentScreen run={displayedRun} go={go} openSheet={openSheet} cash={cash}/>}
        {m.view === 'history' && <HistoryScreen m={m} openRecord={openRecord} cash={cash}/>}
        {m.view === 'my' && <MyScreen m={m} openPolicy={openPolicy} reset={reset} cash={cash}/>}
        {m.view === 'policy' && <PolicyScreen policy={m.policy} go={go} save={savePolicy} error={error} cash={cash}/>}
        {m.view === 'receipt' && <ReceiptScreen run={displayedRun} go={go} cash={cash}/>}
      </div>
      {['home','history','my'].includes(m.view) && <nav className="bottom-nav" aria-label="주 메뉴">
        {tabs.map(([view, Icon, label]) => <button key={view} className={m.view === view ? 'selected' : ''} onClick={() => go(view)} aria-current={m.view === view ? 'page' : undefined}><Icon size={21}/><span>{label}</span></button>)}
      </nav>}
      {toast && <div className="toast" role="status">{toast}</div>}
      {sheet && <Sheet name={sheet} m={m} draft={draft} setDraft={setDraft} requestDraft={requestDraft} setRequestDraft={setRequestDraft} answer={answer} setAnswer={setAnswer} error={error} cash={cash} close={closeSheet} saveConditions={saveConditions} saveRequest={saveRequest} sendAnswer={sendAnswer} approveConstraints={approveConstraints} approveQuote={approveQuote} cancelRun={cancelRun}/>}
      <div className="home-indicator" aria-hidden="true"/>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
