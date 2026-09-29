# Supabase / Vercel 연결

- 배포 주소: https://gwdc-team11.vercel.app
- DB: Vercel 프로젝트에 연결된 Supabase Free `gwdc-team11-db`. Neon은 생성하지 않았다.
- Node.js 24 Vercel Functions에서 기존 Fastify API를 실행한다. Python Function은 기존 고정 정책 계산기와 DDGS/DuckDuckGo를 실행한다. 주문은 SIMULATION이다.
- 정책은 Supabase PostgreSQL의 변경 불가 버전에서 읽고, 버전·다이제스트별로 검증 후 메모리에 캐시한다. 캐시 콜드 스타트는 DB 재검증으로 처리한다. LLM 제공자의 캐시 히트는 보장하지 않는다.
- 거래 계정은 정책 INSERT/UPDATE 권한이 없다. 정책 관리 계정은 새 버전 INSERT만 가능하며 기존 버전 UPDATE는 금지된다. 정책 편집 API의 실행/감사 배타 잠금은 유지한다.
- 브라우저 역할 `anon`/`authenticated`의 업무 테이블 접근을 회수하고 RLS를 적용했다. 사용자별 데이터 접근은 서버에서 검증한 Supabase Auth 사용자 ID로 제한한다.
- Supabase CA와 호스트명을 검증하는 TLS로 transaction pooler에 연결한다. 실행 직렬화는 transaction advisory lock을 사용한다. 세션 advisory lock은 transaction pooler에서 사용하지 않는다.
- API 요청은 사용자별 분당 120회, Kiln은 프로젝트 전체 분당 50회 및 동시 실행 최대 4개로 제한한다. 이는 200명 동시 LLM 실행을 보장하지 않는다.
- 로그인은 `/login`, 회원가입은 `/signup`의 별도 화면이다. 구매 화면에 인증 폼을 삽입하지 않는다. 공개 회원가입/메일 발송은 사용자 결정에 따라 별도 진행한다. SMTP 설정 후 `VITE_PUBLIC_SIGNUP_ENABLED=true`로 재배포해야 가입 제출이 활성화된다. 현재 로그인은 Supabase에 등록되고 이메일 확인된 계정만 지원한다. 기존 Kiln 계정 비밀번호를 재사용하지 않는다.

## 확인 결과

- 실제 TLS DB 접속 및 역할별 정책 쓰기 권한 확인.
- 브라우저 역할의 테이블 직접 조회 401, 인증 없는 앱 조회/정책 생성 401.
- `/api/health` 200. Kiln/search/auth configured, audit unavailable.
- 격리된 QA 계정으로 Computer Use 로그인 → 첫 정책 승인/저장 → 요청 생성 → Kiln Tool Calling → DDGS 실제 후보 10개 표시 확인.
- 검색 가격/평점은 검증되지 않았으며 화면에서 미확인으로 표시. 모의 금액은 사용자가 입력한다.
- 기존 보안·PostgreSQL 멱등성/정책 배타 테스트 11개, 추가 Supabase 인증·DB 정책 캐시 테스트 2개 통과.
- 프론트엔드 번들에 Kiln/DB/Supabase 관리 키가 포함되지 않음을 검사했다.
- 온라인 Python 계산기: 모의 10,000원은 허용, 30,000원은 TRANSACTION_LIMIT으로 반려됨을 확인했다.
- 온라인 Python Function에서도 `rank`를 처리하도록 CLI와 동일한 `dispatch`를 사용한다. 반려 후보 제외와 숫자 기준 순위 테스트를 추가했다.
- 서버 콜드 스타트에서도 DB 정책을 재검증해 견적/평가를 수행하는 테스트를 추가했다. 입력이 모두 있는 HardInput에서 모델이 원문 수집 실패를 이유로 불필요한 정책 완화 질문을 생성하면 도구 실행을 거절한다.

## 남은 범위

- SMTP 및 공개 회원가입 설정.
- Sepolia signer/테스트 자금/지속 실행 감사 Worker와 복구 저장소. 현재 감사 준비가 안 되어 최종 모의 주문은 차단된다. 감사 준비 상태를 임의로 VERIFIED로 기록하지 않는다.
- 온라인 환경의 5,000 사용자/200 동시접속 부하 검증은 수행하지 않았다.

## 재배포

1. `npm run build -w @team11/backend`
2. `node scripts/prepare-vercel.mjs`
3. `vercel deploy --prod --yes --cwd .test-state/vercel-site`

`scripts/provision-supabase.mjs`는 최초 전용 프로비저닝이다. 기존 자격증명을 임의로 교체하지 않는다. 재배포 때 실행하지 않는다. DB 마이그레이션은 소유자 계정으로만 적용한다.
배포용 환경변수·QA 자격증명은 무시된 `.test-state/`에만 보관한다. 서버 키는 Vercel Production Sensitive 환경변수이며 브라우저에는 공개 Supabase URL/키만 포함된다.
