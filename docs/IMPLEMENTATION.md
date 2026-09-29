# 노션 구현 추적

명세: https://app.notion.com/p/3e9a912539f98048b6a1ef9dfe6700c9
연동 계약: https://app.notion.com/p/3eaa912539f9811fb9a1d19342371ebe

- 주문/결제는 SIMULATION. 실제 판매처 호출 없음.
- 검색/Kiln/Sepolia는 실제 연결만 허용. 미설정/실패를 가짜 성공으로 바꾸지 않음.
- TypeScript UI, Node backend, Python 계산, PostgreSQL 업무 상태.
- 9개 Tool, 단계별 선행조건, Plan/HardInput, 명시 승인/재승인.
- 정책 불변 버전/읽기 전용 캐시와 별도 편집 잠금.
- 모의 장부/작업/영수증 원자성, generation fencing, 복구.
- 지정 저장소 감사 브랜치의 v1 payload/해시/체크포인트 보존.
- 영구 로그는 승인/반려만; 업무 상태와 구분.

## 진행
- [x] 대상 저장소 확인, develop 신규 생성 (원격에 기존 develop 없음)
- [x] 현재 노션 명세 조회
- [x] 백엔드/DB/Python/도구 실행
- [x] 감사 어댑터 및 TypeScript UI
- [x] 단위/DB 통합/화면 검증
- 배포 대상 브랜치: origin/develop (커밋/전송 결과는 Git 기록으로 확인)

기존 apps/packages 데모는 새 런타임의 구현 근거로 사용하지 않으며 새 실행 경로에 포함하지 않는다.

## 검증 기록 (2026-09-29)
- backend/TypeScript UI/Solidity 빌드 통과.
- Node 보안·DB 통합 검사 7개, Python 검사 8개 통과.
- 실제 PostgreSQL: 중복 실행 1회 차감, 재승인 generation, 소유자 격리, 정책 편집/시작 경합, runtime 역할의 정책 수정 거절, 200개 동시 인증 조회.
- Computer use: Kiln 콘솔 qwen3-32b 실제 응답, 로컬 앱 실제 ask_clarification → NEEDS_INPUT 확인. 안전 취소 후 정책 편집 탭 활성화 확인.
- 검증 키 발급 및 제공사 한도 $1 설정. 키/비밀번호/접근 토큰은 커밋하지 않음.
- npm audit: 0 vulnerabilities.
- Brave 실제 검색, Sepolia 전송/최종 확정, 운영 계정·파일 ACL 배포, 5,000 사용자 부하는 미검증. fixture 감사 완료 값은 네트워크 검증 증거가 아님.
- 검색은 현재 첫 페이지 최대 10개 및 정적 Product JSON-LD만 지원. 무한 검색/페이지네이션, JS 렌더링, 판매처 로그인은 구현하지 않음.
