import './tutorial.css';

type Step = { target: HTMLElement; title: string; text: string };
let active: HTMLDialogElement | null = null;
export const tutorialOpen = () => active !== null;

// This guide only reads the screen. It never submits forms or changes approvals.
export function startTutorial() {
  if (active) return;
  const content = [
    ['.top-actions .badge', '모의 주문으로 연습해요', '실제 결제나 배송은 일어나지 않습니다. 감사 기록의 확정 여부는 별도로 확인하세요.'],
    ['#connection-toggle', '먼저 로그인해요', '이메일로 로그인하고, 처음에는 구매 정책과 모의 잔고를 직접 정하세요.'],
    ['.policy-rail', '구매 기준을 확인해요', '한도와 허용 조건을 확인하세요. 모바일에서는 이 패널을 펼치면 됩니다. 거래 중 정책은 읽기 전용입니다.'],
    ['.track-choice', '구매 방식을 골라요', '함께 계획은 질문과 예시로 조건을 정합니다. 조건 직접 입력은 정해 둔 금액과 수량을 사용합니다.'],
    ['#query', '필요한 것을 적어요', '구매할 품목, 용도, 꼭 지켜야 할 조건을 적으세요.'],
    ['#maxTotal', '금액과 수량을 정해요', '최대 모의 금액과 수량을 입력하세요. 조건 직접 입력에서는 두 값이 모두 필요합니다.'],
    ['#request-form button[type=submit]', '계획을 시작해요', '시작하기를 누르면 요청이 만들어집니다. 이후 계속하기로 에이전트를 진행하세요.'],
    ['#resume', '한 단계씩 진행해요', '계속하기로 검색과 검토를 진행하세요. 질문이 나오면 요청 내용을 보완합니다.'],
    ['#constraints-check', '조건을 먼저 승인해요', '조건과 판정 결과를 읽고 체크한 뒤 구매 조건 승인을 누르세요.'],
    ['.candidate-card', '후보와 근거를 살펴봐요', '후보를 선택하고 출처 확인을 펼쳐 보세요. 미확인 가격이나 평점은 검증된 정보가 아닙니다.'],
    ['#unitPrice', '모의 금액을 입력해요', '선택한 후보의 단가와 배송비를 직접 정합니다. 실제 판매처 견적이 아닙니다.'],
    ['.final-review', '마지막으로 직접 승인해요', '품목·수량·합계·정책을 확인한 뒤 모의 주문에 동의하세요. 감사 연결이 준비되어야 실행할 수 있습니다.'],
    ['[data-page="policy"]', '정책 변경은 별도로 해요', '정책 메뉴에서 새 버전을 작성합니다. 거래가 진행 중이면 이 메뉴는 잠깁니다.'],
    ['#policy-form', '변경 내용을 확인해요', '통화와 한도를 검토하고 동의한 뒤 발행하세요. 편집 중에는 거래를 시작할 수 없습니다.'],
    ['[data-page="history"]', '결과는 기록에서 봐요', '모의 영수증과 감사 상태를 확인할 수 있습니다. 이 안내는 처음이신가요?에서 언제든 다시 볼 수 있어요.'],
  ];
  const steps: Step[] = content.flatMap(([selector, title, text]) => {
    const target = document.querySelector<HTMLElement>(selector);
    return target && target.getClientRects().length ? [{ target, title, text }] : [];
  });
  if (!steps.length) return;
  const opener = document.activeElement as HTMLElement | null;
  const startScroll = window.scrollY;
  const dialog = document.createElement('dialog');
  dialog.className = 'tutorial';
  dialog.setAttribute('aria-labelledby', 'tutorial-title');
  dialog.setAttribute('aria-describedby', 'tutorial-text');
  dialog.innerHTML = `<div class="tutorial-ring" aria-hidden="true"></div><section class="tutorial-bubble"><div class="tutorial-heading"><span class="tutorial-count"></span><button type="button" class="tutorial-close" aria-label="사용설명서 닫기">×</button></div><div aria-live="polite" aria-atomic="true"><h2 id="tutorial-title"></h2><p id="tutorial-text"></p></div><div class="tutorial-controls"><button type="button" class="tutorial-prev">이전</button><button type="button" class="tutorial-next">다음</button></div></section>`;
  document.body.append(dialog);
  active = dialog;
  const bubble = dialog.querySelector<HTMLElement>('.tutorial-bubble')!;
  const ring = dialog.querySelector<HTMLElement>('.tutorial-ring')!;
  const prev = dialog.querySelector<HTMLButtonElement>('.tutorial-prev')!;
  const next = dialog.querySelector<HTMLButtonElement>('.tutorial-next')!;
  let index = 0;
  function position() {
    const target = steps[index].target;
    if (!target.isConnected) { dialog.close(); return; }
    const r = target.getBoundingClientRect();
    const w = document.documentElement.clientWidth, h = window.innerHeight;
    const left = Math.max(6, r.left - 5), top = Math.max(6, r.top - 5);
    Object.assign(ring.style, { left: left+'px', top: top+'px', width: Math.max(0, Math.min(w-6,r.right+5)-left)+'px', height: Math.max(0, Math.min(h-6,r.bottom+5)-top)+'px' });
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    const x = Math.max(12, Math.min(w-bw-12, r.left+r.width/2-bw/2));
    const below = r.bottom+16+bh <= h-12;
    const above = r.top-16-bh >= 12;
    const y = below ? r.bottom+16 : above ? r.top-16-bh : Math.max(12,(h-bh)/2);
    bubble.dataset.side = below ? 'below' : above ? 'above' : 'center';
    bubble.style.left = x+'px'; bubble.style.top = y+'px';
    bubble.style.setProperty('--arrow-x', Math.max(24,Math.min(bw-24,r.left+r.width/2-x))+'px');
  }
  function show() {
    const step = steps[index];
    dialog.querySelector('.tutorial-count')!.textContent = `사용설명서 · ${index+1} / ${steps.length}`;
    dialog.querySelector('#tutorial-title')!.textContent = step.title;
    dialog.querySelector('#tutorial-text')!.textContent = step.text;
    prev.disabled = index === 0;
    next.textContent = index === steps.length-1 ? '완료' : '다음';
    step.target.scrollIntoView({ block: 'center', behavior: 'instant' });
    position();
    next.focus({preventScroll:true});
  }
  prev.onclick = () => { if(index>0) { index--; show(); } };
  next.onclick = () => { if(index<steps.length-1) { index++; show(); } else dialog.close(); };
  dialog.querySelector<HTMLButtonElement>('.tutorial-close')!.onclick = () => dialog.close();
  dialog.addEventListener('keydown', ev => {
    if(ev.key==='ArrowRight') { ev.preventDefault(); next.click(); }
    if(ev.key==='ArrowLeft') { ev.preventDefault(); prev.click(); }
  });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  dialog.addEventListener('close', () => {
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position, true);
    dialog.remove(); active = null;
    window.scrollTo({top:startScroll,behavior:'instant'});
    if(opener?.isConnected) opener.focus({preventScroll:true});
  }, {once:true});
  dialog.showModal();
  show();
}
