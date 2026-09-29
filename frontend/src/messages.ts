export const messages:Record<string,string>={
 UNAUTHORIZED:'로그인이 필요합니다.',AUTH_NOT_CONFIGURED:'인증 서비스가 설정되지 않았습니다.',
 LOGIN_FAILED:'이메일과 비밀번호를 확인해 주세요.',SIGNUP_INPUT_REQUIRED:'이메일과 12자 이상의 비밀번호를 입력해 주세요.',SIGNUP_FAILED:'가입 메일을 발송하지 못했습니다. 이메일을 확인하거나 관리자에게 문의해 주세요.',
 SIGNUP_UNAVAILABLE:'인증 메일 설정 후 회원가입할 수 있습니다.',PASSWORD_MISMATCH:'비밀번호가 일치하지 않습니다.',
 BACKEND_UNAVAILABLE:'서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',AUTH_UNAVAILABLE:'로그인 확인이 지연되고 있습니다.',POLICY_ALREADY_EXISTS:'이미 정책이 있습니다. 페이지를 새로고침하세요.',
 BACKEND_NOT_CONFIGURED:'온라인 실행 서버가 아직 연결되지 않았습니다. 튜토리얼을 먼저 둘러볼 수 있습니다.',
 SERVICE_UNAVAILABLE:'서비스에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
 SEARCH_NOT_CONFIGURED:'검색 API 연결이 필요합니다. 관리자 설정 후 다시 시도해 주세요.',
 SEARCH_UNAVAILABLE:'검색 서비스가 응답하지 않습니다.',SEARCH_INVALID_RESPONSE:'검색 응답을 검증하지 못해 중단했습니다. 후보를 임의로 생성하지 않습니다.',
 AUDIT_NOT_READY:'감사 연결이 준비되지 않아 모의 주문을 진행할 수 없습니다. RPC·테스트 자금·감사 Worker를 확인해 주세요.',
 AUDIT_UNSUPPORTED:'현재 감사는 KRW 단일 품목·리뷰 비필수 정책만 지원합니다.',
 POLICY_ADMIN_UNAVAILABLE:'정책 관리 서비스에 연결할 수 없습니다. 관리자에게 연결을 요청해 주세요.',
 POLICY_BUSY:'실행 또는 감사 복구 중에는 정책을 변경할 수 없습니다.',POLICY_NOT_READY:'정책 파일 검증에 실패했습니다.',
 SIMULATION_INPUT_REQUIRED:'후보를 선택하고 모의 단가와 배송비를 입력해 주세요.',SIMULATION_BALANCE_NOT_CONFIGURED:'이 통화의 모의 장부가 준비되지 않았습니다.',
 KILN_NOT_CONFIGURED:'에이전트 API 연결이 필요합니다.',KILN_UNAVAILABLE:'에이전트가 응답하지 않습니다. 현재 상태를 확인하고 재시도해 주세요.',
 LLM_BUSY:'에이전트 사용량이 많습니다. 잠시 후 다시 시도해 주세요.',RUN_BUSY:'진행 중인 요청을 먼저 마치거나 취소해 주세요.',
 INVALID_INPUT:'입력을 확인해 주세요. 금액은 최소 통화 단위의 0 이상 정수로 입력합니다.',INVALID_STAGE:'현재 단계에서 사용할 수 없는 작업입니다.',
 STALE_APPROVAL:'승인 대상이 변경됐습니다. 최신 내용을 확인해 주세요.',STALE_RUN:'요청 상태가 바뀌었습니다. 다시 확인해 주세요.',STALE_CONSTRAINTS:'구매 조건이 바뀌었습니다.',
 CONSTRAINT_APPROVAL_REQUIRED:'구매 조건과 판정 결과를 먼저 확인하고 승인해 주세요.',PURCHASE_APPROVAL_REQUIRED:'최종 모의 견적을 확인하고 동의해 주세요.',
 QUOTE_EXPIRED:'견적이 만료됐습니다. 새 버전을 확인하고 다시 승인하세요.',RECOVERY_REQUIRED:'감사가 미완료 상태입니다. 모의 주문을 재실행하지 말고 복구를 기다려 주세요.',
 EXACT_INPUT_MISMATCH:'명시한 상품명 또는 조건과 일치하지 않습니다.',TRANSACTION_LIMIT:'단일 거래 한도를 초과합니다.',BUDGET_LIMIT:'누적 예산을 초과합니다.',INSUFFICIENT_BALANCE:'모의 잔고 또는 잔여 예산이 부족합니다.',
 MERCHANT_EVIDENCE_MISSING:'판매처 식별 근거가 확인되지 않았습니다.',MERCHANT_NOT_ALLOWED:'허용된 판매처가 아닙니다.',MERCHANT_BLOCKED:'차단한 판매처입니다.',
 BRAND_EVIDENCE_MISSING:'브랜드 근거가 없습니다.',BRAND_BLOCKED:'제외된 브랜드입니다.',REVIEW_EVIDENCE_MISSING:'필수 리뷰 근거가 없습니다.',REVIEW_TOO_LOW:'평점이 기준보다 낮습니다.',POLICY_EXPIRED:'정책 유효기간이 지났습니다.',
 SOURCE_NOT_ALLOWED:'수집 허용 출처가 아닙니다.',UNSUPPORTED_SOURCE:'현재 수집 방식으로 확인할 수 없는 자료입니다.',RATE_LIMITED:'요청이 많습니다. 잠시 후 재시도해 주세요.',NOT_FOUND:'항목을 찾을 수 없습니다.',EVALUATION_FAILED:'계산 결과를 검증하지 못했습니다.'
};
export const explain=(code:string)=>messages[code]??'요청을 처리하지 못했습니다. 현재 상태를 확인하고 다시 시도해 주세요.';
export const stateNames:Record<string,string>={READY:'진행 준비',NEEDS_INPUT:'추가 확인',CONSTRAINTS_DRAFT:'조건 검토',NEEDS_APPROVAL:'최종 승인 대기',READY_FOR_TOOL:'승인 완료',PROCESSING:'모의 주문 처리 중',AUDIT_PENDING:'감사 대기',ACTION_REQUIRED:'확인 필요',REJECTED:'반려',COMPLETED:'완료',COMMITTED:'모의 주문 확정',CANCELED:'취소됨',NEEDS_RECONFIRMATION:'견적 재확인',PENDING:'대기',INCLUDED:'블록 포함',FINALIZED:'최종 확정',RECONCILIATION_REQUIRED:'감사 복구 필요',RUNNING:'처리 중'};
