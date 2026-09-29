# 테스트 가입·트랜잭션 설정·AI 요약 QA (2026-09-29)

- 테스트 가입: 이메일 필드를 문자열 아이디로 변경. Supabase Confirm email 해제 후 실제 가입 200, 즉시 세션 생성, 비밀번호 재로그인 200 확인. 운영 브라우저에서도 한글 문자열 아이디 로그인 성공.
- 기존 이메일 계정은 그대로 로그인 가능. 일반 문자열 아이디는 정규화 후 SHA-256 기반 내부 식별자로 변환하며 비밀번호 인증과 서버 사용자 검증 유지. 아이디는 앞뒤 공백 제거·NFKC 정규화·소문자 처리.
- 홈의 ‘필요한 구매, 예산 안에서’ 및 설명·진행 안내 삭제.
- 설정 탭에서 Sepolia 연결 준비 상태와 본인 감사 기록 최대 50개를 조회. 실제 report의 해시·블록·receiptStatus·verification·finality만 표시. 체인 ID와 해시 형식 검증 후 고정된 Sepolia 탐색기 링크 생성.
- /api/audits: 운영 비로그인 401, 로그인 200. PostgreSQL 통합 테스트에서 타 계정 기록 미노출 확인.
- AI 작업 요약: 기존 서버 상태·검색 후보·정책 검사·견적·영수증에서 확인된 결과만 표시. 실행 중 4초 간격 조회, 숨긴 탭에서는 조회 생략, 종료 시 타이머 정리. 모델의 내부 추론 원문이나 가상 진행 로그는 생성하지 않음.
- 로컬 실제 에이전트 호출 중 ‘AI 작업 응답을 기다리는 중’ 표시와 스크린샷 확인. 이번 검증은 AI 응답의 모든 단계 완료 또는 구매 완료를 의미하지 않음.
- TypeScript/Vite 빌드 성공. 식별자·탐색기 링크·요약 및 기존 인증/캐시 테스트 5개 통과. PostgreSQL 멱등성·200개 요청·소유권 통합 테스트 1개 통과.
- 운영 배포: dpl_EAUZg3WmzxEqt2Bw27Awyhv3jZ1c (READY), https://gwdc-team11.vercel.app/
- 운영 설정 화면에서 감사 연결 미준비 확인. 실제 Sepolia 송신은 이번 작업에서 발생/검증하지 않았으며, 미준비 상태의 구매 차단 유지.
- 증거: C:/Users/user/.codex/visualizations/2026/09/29/01a0eb39-368d-7622-b9cd-7b0c88af607e/test-signup-confirmation-off.png, transaction-settings-mobile.png, ai-work-summary-running.png
