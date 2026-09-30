export type Language='ko'|'en';
export let language:Language=localStorage.getItem('gwdc-language')==='en'?'en':'ko';
export function setLanguage(next:Language){language=next;localStorage.setItem('gwdc-language',next);document.documentElement.lang=next;}
document.documentElement.lang=language;

const en:Record<string,string>={
 '구매':'Purchase','정책':'Policy','기록':'History','설정':'Settings','주문 기록':'Order history','주 메뉴':'Main menu',
 '로그인':'Sign in','로그아웃':'Sign out','회원가입':'Sign up','처음이신가요?':'New here?',
 '앱 설치':'Install app','앱으로 사용하기':'Use as an app','닫기':'Close',
 '오프라인입니다. 연결 후 다시 시도하세요.':'You are offline. Reconnect and try again.',
 '안드로이드 Chrome: 메뉴 → 앱 설치':'Android Chrome: Menu → Install app',
 '윈도우 Edge: 메뉴 → 앱 → 이 사이트를 앱으로 설치':'Windows Edge: Menu → Apps → Install this site as an app',
 '설치 메뉴가 없으면 브라우저에서 그대로 사용할 수 있습니다. 구매 기능은 인터넷 연결이 필요합니다.':'If installation is unavailable, continue in your browser. Purchasing requires internet access.',
 '모의 주문':'Simulated order','모의 잔고':'Simulated balance','예약 중':'Reserved','거래 한도':'Transaction limit',
 '실제 결제 없는':'No real payments','구매 시뮬레이션':'Purchase simulation',
 '예산과 조건에 맞는 상품을 찾아보세요.':'Find products that fit your budget and conditions.',
 '구매 한도와 허용 조건을 확인하세요.':'Review spending limits and purchase rules.',
 '모의 주문과 영수증을 확인하세요.':'Review simulated orders and receipts.',
 '블록체인 감사 상태를 확인하세요.':'Review blockchain audit records.',
 'AI 구매 에이전트':'AI purchasing agent','무엇을 대신 찾아볼까요?':'What should I find for you?',
 '원하는 것을 말하면 정책을 확인하고 상품 근거를 찾아요.':'Describe what you need. The agent checks your policy and finds product evidence.',
 '에이전트에게 요청하기':'Tell the agent what you need','예: 사무실에서 쓸 조용한 키보드를 찾아줘':'Example: Find a quiet keyboard for the office',
 '진행 방식':'How to proceed','함께 계획':'Plan together','조건 고정':'Fixed conditions',
 '대화로 조건을 정하고 초안을 승인':'Discuss the conditions and approve the plan',
 '입력한 금액·수량 그대로 판정':'Evaluate your exact price and quantity',
 '모르는 조건은 에이전트가 질문합니다. 제안된 조건과 정책 예시를 검토하고 승인하세요.':'The agent asks about missing conditions. Review and approve the proposed terms.',
 '이번 요청의 조건':'Conditions for this request','설정하기 ›':'Set up ›','조건 닫기':'Close conditions',
 '함께 계획은 비워 둔 조건을 대화로 정할 수 있습니다.':'In Plan together, you can discuss any conditions you leave blank.',
 '최대 금액 · KRW':'Maximum total · KRW','최대 금액':'Maximum total','수량':'Quantity','정확한 상품명':'Exact product name',
 '선택 사항':'Optional','필요한 경우에만 입력':'Only if needed',
 '조건 충족 시 모의 주문 자동 확정':'Automatically confirm simulated order when conditions match',
 '금액·수량·정확한 상품명이 모두 필요해요.':'Set a maximum total, quantity, and exact product name.',
 '추가 지침 쓰기':'Add instructions','이 요청에만 적용되는 선호 사항':'Preferences for this request only',
 '에이전트에게 전할 추가 지침':'Additional instructions for the agent','예: 배송비를 포함해 비교해 줘':'Example: Include shipping in the comparison',
 '요청 문구에 함께 전송됩니다. 금액·수량·정책 제한을 바꾸지는 않습니다.':'Added to your request. This does not change price, quantity, or policy limits.',
 '조건 적용':'Apply conditions','에이전트 시작':'Start agent',
 '모의 주문 앱입니다. 실제 상품 결제·배송은 발생하지 않습니다.':'This is a simulation. No real product payment or delivery occurs.',
 '구매 조건':'Purchase conditions','검색 내용':'Search request','미지정':'Not specified','조건과 판정 결과를 확인했습니다.':'I reviewed the conditions and evaluation.',
 '고정 조건 승인':'Approve fixed conditions','제안 조건 승인':'Approve proposed conditions',
 '검토 승인됨':'Reviewed','검토 필요':'Review needed','허용':'Allowed','반려':'Rejected',
 '정책 예시':'Policy example','후보 판정':'Candidate evaluation','현재 정책 범위 안에 있습니다.':'Within the current policy.',
 '상품 검색 결과':'Product search results','가격 근거':'Price evidence','판매 페이지 가격':'Observed price','배송비':'Shipping',
 '검색 이어가기':'Continue search','상품명 또는 모델명':'Product or model name','금액·수량 조정':'Adjust price or quantity',
 '바꾸려는 값만 입력하세요. 비워 둔 조건은 그대로 유지됩니다.':'Enter only values you want to change.',
 '최대 금액 (선택)':'Maximum total (optional)','수량 (선택)':'Quantity (optional)','정확한 상품명 (선택)':'Exact product name (optional)',
 '같은 상품 다시 검색':'Search again','최종 모의 주문 확인':'Final simulated order review',
 '확인한 단가':'Observed unit price','합계':'Total','가격 확인 시각':'Price observed at',
 '품목·금액·정책을 확인했으며 모의 주문에 동의합니다.':'I reviewed the item, total, and policy and agree to this simulated order.',
 '모의 주문 승인 및 실행':'Approve and run simulated order','견적이 만료됐습니다. 새 검색이 필요합니다.':'The quote expired. Search again.',
 '실제 주문·청구·배송이 없는 모의 영수증입니다.':'This is a simulated receipt; no real order, charge, or delivery occurs.',
 '모의 영수증이 생성되었습니다.':'Simulated receipt created.','정책 식별값':'Policy digest',
 '검색 재시도':'Retry search','요청 취소':'Cancel request','요청을 취소할까요?':'Cancel this request?',
 '검색과 구매 진행을 중단합니다. 아직 확정되지 않은 예약은 해제됩니다.':'Search and purchase processing will stop. Pending reservations will be released.',
 '계속 진행':'Keep going','요청 ID':'Request ID','정책 · 읽기 전용':'Policy · read only',
 'AI 작업 요약':'AI activity','추가 확인이 필요합니다':'More information needed','확인이 필요합니다':'Action needed',
 '요청을 처리하지 못했습니다. 현재 상태를 확인하고 다시 시도해 주세요.':'The request could not be completed. Check the current status and try again.',
 '판매 페이지에서 가격과 배송비를 확인하지 못했습니다. 상품명을 바꿔 다시 검색해 주세요.':'Price or shipping could not be verified on the merchant page. Try another product name.',
 '상품은 찾았지만 판매 페이지에서 배송비를 확인하지 못했습니다. 같은 상품으로 다른 판매처를 다시 검색하거나, 모델명을 더 정확히 입력해 주세요.':'The product was found, but shipping could not be verified. Try another merchant or a more exact model name.',
 '블록체인 트랜잭션':'Blockchain transactions','새로고침':'Refresh','네트워크':'Network','감사 연결':'Audit connection',
 '연결 준비됨':'Ready','연결 미준비':'Not ready','주문 방식':'Order mode','가스 지불':'Gas paid by',
 '서비스 대납':'Service relayer','개인 지갑':'Personal wallet','미연결':'Not connected',
 '구매 승인 후 생성된 실제 감사 트랜잭션을 확인합니다. 실제 상품 결제는 발생하지 않습니다.':'View the real audit transaction created after purchase approval. No real product payment occurs.',
 '내 Sepolia 지갑':'My Sepolia wallet','감사 가스는 서비스가 대납합니다.':'The service pays audit gas.',
 '개인 지갑이 없습니다.':'No personal wallet yet.','발급 대기':'Creation pending','지갑 만들기':'Create wallet',
 '아직 트랜잭션 기록이 없습니다.':'No transactions yet.','블록':'Block','실행 결과':'Execution result','성공':'Success',
 '실패':'Failed','미확인':'Unconfirmed','검증':'Verification','검증됨':'Verified','최종 확정':'Finality','확정됨':'Finalized','미확정':'Not finalized',
 'Sepolia에서 확인':'View on Sepolia','Etherscan에서 확인':'View on Etherscan',
 '요청 기록':'Request history','모의 주문 기록':'Simulated order history','아직 요청이 없습니다.':'No requests yet.',
 '아직 주문 기록이 없습니다.':'No orders yet.','감사 상태':'Audit status','트랜잭션':'Transaction',
 '구매 기준 만들기':'Set purchase rules','먼저 예산을 정해 주세요':'Set your budget first',
 '정책은 요청마다 적용되고, 변경 시 새 버전으로 발행됩니다.':'Your policy applies to each request. Changes create a new version.',
 '누적 예산 한도 · 원':'Total budget · KRW','필요한 기준만 추가':'Add only the rules you need',
 '스위치를 켜면 세부 입력란이 열립니다.':'Turn on a switch to enter its details.',
 '1회 한도 지정':'Set per-order limit','비워두면 누적 예산과 같습니다.':'Defaults to the total budget.',
 '최소 잔여 금액':'Minimum remaining balance','구매 후 남겨 둘 금액을 지정합니다.':'Amount to retain after purchase.',
 '허용 판매처만 사용':'Restrict merchants','판매처 차단':'Block merchants','브랜드 제외':'Exclude brands','최소 평점 지정':'Set minimum rating',
 '유효기간과 모의 잔고':'Expiration and simulated balance','유효기간':'Valid until','모의 잔고 · 원':'Simulated balance · KRW',
 '정책을 확인하고 저장합니다.':'I reviewed the policy and agree to save it.','정책 저장':'Save policy',
 '현재 정책':'Current policy','읽기 전용':'Read only','단일 거래 한도':'Per-order limit','누적 예산 한도':'Total budget',
 '사용 / 예약':'Spent / reserved','허용 판매처':'Allowed merchants','차단 판매처':'Blocked merchants','제외 브랜드':'Excluded brands',
 '최소 평점':'Minimum rating','선호 기준':'Ranking preference','제한 없음':'No restriction','없음':'None','필수 아님':'Not required',
 '낮은 가격':'Lower price','높은 평점':'Higher rating','전체 정책 확인':'View full policy',
 '구매 정책':'Purchase policy','아직 정책이 없습니다.':'No policy yet.','정책 추가하기':'Add policy',
 '정책 변경':'Change policy','편집 중':'Editing','새 정책 버전 작성':'Create policy version',
 '편집 세션 열기':'Open edit session','통화':'Currency','세부 기준':'Detailed rules',
 '낮은 가격 우선':'Prefer lower price','높은 평점 우선':'Prefer higher rating',
 '변경 내용과 새 버전 발행에 동의합니다.':'I agree to publish a new policy version.',
 '편집 취소':'Cancel editing','구매 정책이 없습니다':'No purchase policy',
 '나에게 맞는 구매 흐름':'A purchase flow for you','필요한 물건을,':'Find what you need,','안심하고 찾아보세요.':'with confidence.',
 '예산과 조건을 정하고, 후보를 확인한 뒤 모의 주문까지 한곳에서 진행해요.':'Set a budget, review candidates, and complete a simulated order in one place.',
 '구매 시작하기':'Start purchasing','기준 설정':'Set rules','상품 확인':'Review products',
 '예산과 구매 조건을 정해요.':'Set a budget and purchase rules.','가격 근거와 후보를 살펴봐요.':'Review candidate products and price evidence.',
 '최종 내용을 확인하고 기록해요.':'Review and record the final result.',
 '아이디':'Account ID','비밀번호':'Password','비밀번호 확인':'Confirm password','구매로':'Back to purchase',
 '다시 만나서':'Welcome','반가워요':'back','계정이 없나요?':'Need an account?','이미 계정이 있나요?':'Already have an account?',
 '입력 조건은 바뀌지 않으며, 실제 후보 판정에서 허용된 결과만 승인할 수 있습니다.':'Your fixed conditions stay unchanged. Approve only candidates allowed by the policy.',
 '에이전트가 조건을 제안하고, 정책 예시를 검토한 뒤 승인합니다.':'The agent proposes conditions for your review and approval.',
 '금액과 수량을 먼저 입력합니다. 에이전트는 값을 바꾸지 않고 후보를 판정합니다.':'Enter a maximum total and quantity. The agent evaluates candidates without changing them.',
 '최대 금액과 수량은 필수입니다. 입력값과 다른 조건은 승인할 수 없습니다.':'Maximum total and quantity are required. Different conditions cannot be approved.',
 '01 요청':'01 Request','02 조건 검토':'02 Review conditions','03 최종 승인':'03 Final approval','04 기록':'04 Record',
 '판매 페이지 열기':'Open merchant page','확인 불가':'Unavailable','출처 확인 불가':'Source unavailable','다시 검색 필요':'Search again',
 '가격이 확인된 판매 페이지를 찾지 못했습니다.':'No merchant page with a verified price was found.',
 '실제 주문·청구·배송은 없습니다. 감사 확정 여부를 별도로 확인하세요.':'No real order, charge, or delivery occurs. Check the audit record separately.',
 '영수증 확인':'View receipt','트랜잭션 확인':'View transaction','고객 조건 승인 확인':'User approval recorded',
 '구매 조건 정리됨':'Purchase conditions prepared','추가 정보 요청':'More information requested','사용자 조건 승인 확인':'User conditions approved',
 '모의 견적 준비됨':'Simulated quote prepared','모의 주문 기록 생성됨 · 온체인 상태는 기록에서 확인':'Simulated order recorded · check chain status in History',
 'AI 작업 응답을 기다리는 중…':'Waiting for the agent…',
 '진행 준비':'Ready','추가 확인':'More information needed','조건 검토':'Review conditions','최종 승인 대기':'Awaiting final approval',
 '승인 완료':'Approved','모의 주문 처리 중':'Processing simulated order','감사 대기':'Audit pending','확인 필요':'Action needed',
 '완료':'Completed','모의 주문 확정':'Simulated order confirmed','취소됨':'Canceled','견적 재확인':'Reconfirm quote',
 '대기':'Pending','블록 포함':'Included in block','감사 복구 필요':'Audit recovery needed','처리 중':'Processing'
};

function translated(value:string){
 const match=value.match(/^(\s*)([\s\S]*?)(\s*)$/);if(!match)return value;
 const body=match[2],direct=en[body];if(direct)return match[1]+direct+match[3];
 let result=body.replace(/검색 후보 (\d+)개 확인/g,'$1 search candidates found')
  .replace(/정책·금액 검사 (\d+)건 · 허용 (\d+)건/g,'Policy and price checks: $1 · allowed: $2')
  .replace(/요청 접수 · 정책 v(\d+) 적용/g,'Request received · policy v$1 applied')
  .replace(/정책 v(\d+)/g,'Policy v$1')
  .replace(/^조건 고정 · Policy v(\d+)$/,'Fixed conditions · Policy v$1')
  .replace(/^함께 계획 · Policy v(\d+)$/,'Plan together · Policy v$1')
  .replace(/^진행 중단 · /,'Stopped · ')
  .replace(/^(\d+)개$/,'$1 items')
  .replace(/^(\d+)건$/,'$1 checks')
  .replace(/판매 페이지 가격 ([\d,]+|확인 불가) ([A-Z]*) · 배송비 ([\d,]+|확인 불가) ([A-Z]*)/g,'Observed price $1 $2 · shipping $3 $4');
 return result===body?value:match[1]+result+match[3];
}

export function translateUi(root:Element){
 if(language!=='en')return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;
  if(node.parentElement?.closest('script,style,textarea,[data-no-translate],.hash,.source'))continue;
  node.textContent=translated(node.textContent??'');
 }
 for(const el of Array.from(root.querySelectorAll<HTMLElement>('[placeholder],[aria-label],[title]'))){
  for(const key of ['placeholder','aria-label','title']){const value=el.getAttribute(key);if(value)el.setAttribute(key,translated(value));}
 }
}
