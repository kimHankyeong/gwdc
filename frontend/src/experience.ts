export function requestExperience(e:(value:unknown)=>string, disabled:boolean, currency:string) {
  return `<section class="surface request-surface">
    <span class="ux-eyebrow">AI 구매 에이전트</span>
    <h2>무엇을 대신 찾아볼까요?</h2>
    <p class="ux-subtitle">원하는 것을 말하면 정책을 확인하고 상품 근거를 찾아요.</p>
    <form id="request-form"><fieldset${disabled?' disabled':''}>
      <label class="field" for="query"><span>에이전트에게 요청하기</span><textarea id="query" rows="3" maxlength="600" required placeholder="예: 사무실에서 쓸 조용한 키보드를 찾아줘"></textarea></label>
      <div class="ux-mode-label">진행 방식</div>
      <div class="track-choice ux-track-choice" role="radiogroup" aria-label="진행 방식">
        <label><input type="radio" name="track" value="Plan" checked><span><b>함께 계획</b><small>대화로 조건을 정하고 초안을 승인</small></span></label>
        <label><input type="radio" name="track" value="HardInput"><span><b>조건 고정</b><small>입력한 금액·수량 그대로 판정</small></span></label>
      </div>
      <div id="track-explanation" class="ux-track-explanation">모르는 조건은 에이전트가 질문합니다. 제안된 조건과 정책 예시를 검토하고 승인하세요.</div>
      <button id="open-conditions" class="ux-condition-open" type="button">${'⚙'} 이번 요청의 조건 <span>설정하기 ›</span></button>
      <dialog id="conditions-dialog" class="ux-sheet" aria-labelledby="conditions-title">
        <div class="ux-sheet-handle" aria-hidden="true"></div>
        <div class="ux-sheet-head"><h3 id="conditions-title">이번 요청의 조건</h3><button id="close-conditions" type="button" aria-label="조건 닫기">×</button></div>
        <div class="ux-sheet-scroll"><p class="muted" id="condition-lead">함께 계획은 비워 둔 조건을 대화로 정할 수 있습니다.</p>
          <div class="form-grid"><label class="field" for="maxTotal"><span>최대 금액 · ${e(currency)}</span><input id="maxTotal" inputmode="numeric" pattern="[0-9]+" maxlength="15" data-amount placeholder="선택 사항"></label><label class="field" for="quantity"><span>수량</span><input id="quantity" type="number" min="1" max="100000" placeholder="선택 사항"></label></div>
          <label class="field" for="requiredName"><span>정확한 상품명</span><input id="requiredName" maxlength="300" placeholder="필요한 경우에만 입력"></label>
          <div id="auto-wrap" hidden><label class="ux-toggle-line"><span><strong>조건 충족 시 모의 주문 자동 확정</strong><small>금액·수량·정확한 상품명이 모두 필요해요.</small></span><input id="auto-purchase" type="checkbox" role="switch"></label></div>
          <label class="ux-toggle-line"><span><strong>추가 지침 쓰기</strong><small>이 요청에만 적용되는 선호 사항</small></span><input id="guide-toggle" type="checkbox" role="switch"></label>
          <label id="guide-wrap" class="field" for="request-guide" hidden><span>에이전트에게 전할 추가 지침</span><textarea id="request-guide" rows="3" maxlength="300" placeholder="예: 배송비를 포함해 비교해 줘"></textarea><small>요청 문구에 함께 전송됩니다. 금액·수량·정책 제한을 바꾸지는 않습니다.</small></label>
        </div><div class="ux-sheet-footer"><button id="apply-conditions" type="button" class="primary">조건 적용</button></div>
      </dialog>
      <button class="primary ux-start" type="submit">에이전트 시작 <span aria-hidden="true">→</span></button>
      <p class="ux-disclosure">모의 주문 앱입니다. 실제 상품 결제·배송은 발생하지 않습니다.</p>
    </fieldset></form>
  </section>`;
}

export function policySwitch(id:string,title:string,description:string,checked:boolean,body:string) {
  return `<section class="ux-policy-option"><label class="ux-toggle-line"><span><strong>${title}</strong><small>${description}</small></span><input id="${id}" type="checkbox" role="switch"${checked?' checked':''}></label><div class="ux-option-body" data-toggle-body="${id}"${checked?'':' hidden'}>${body}</div></section>`;
}
