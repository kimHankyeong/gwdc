# 구매 작업실 디자인

- 기존 OpenDesign의 잉크색·종이색·브론즈 강조와 IBM Plex 서체를 현재 범용 구매 에이전트에 적용.
- 업무 의미의 기준: 노션 App Filetrees/PSEUDO 01–03/연동 명세. 특정 구매 분야·본사/가맹점 역할은 사용하지 않음.
- 실제 구현: frontend/src/main.ts, style.css, tokens.css. React 없이 TypeScript.
- purchase.html, policy.html, history.html은 현재 UI에서 수집하고 독립 검수를 거친 안전한 정적 디자인 자료. QA 예시 정책이며 검색·실결제·감사 성공 증거가 아님.
- 실제 기능 검증은 localhost:5173에서 수행. 정적 자료에는 API 호출과 인증 토큰을 포함하지 않음.
- 디자인 언어: 조용한 업무 화면, 작은 모서리, 선과 여백으로 구분. 정책은 읽기 전용, 동의는 거래 직전, 내부 ID는 직접 입력하지 않음.
- 모바일 44px 조작 영역, 키보드 초점, 오류/상태 텍스트, 동작 축소 환경을 지원.
