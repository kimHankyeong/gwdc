# Team 11 · 정책 기반 구매 시뮬레이션

노션 App Filetrees / PSEUDO 01–03 / 연동 명세를 기준으로 만든 Node.js + TypeScript + PostgreSQL + Python 구현입니다. UI는 React 없이 TypeScript/Vite를 사용합니다.

**주문·결제는 SIMULATION입니다. 실제 판매처 주문·청구·배송·실자금 이동이 없습니다.** 감사만 모의 영수증을 실제 Sepolia AuditRecord에 기록합니다. 검색·Kiln·체인 오류를 가짜 성공으로 바꾸는 fallback은 없습니다.

## 한 번에 실행

- 일반 사용: `start-app.cmd` 더블클릭 또는 `npm run app`. 온라인 앱을 열며 로컬 DB/Python을 켤 필요가 없습니다.
- 개발: 의존성·DB·`.env` 준비 후 `npm run dev:all`. 검색/API/정책/UI를 함께 실행하고 Ctrl+C로 종료합니다. 감사 signer는 별도입니다.
- 검증과 제한: [PWA·구매 4건·공격 10건 보고서](docs/QA-PWA-SCENARIOS-2026-09-29.md).

## 코드 위치

- `backend/src/`: 인증, 정책 버전/캐시, 9개 Tool, Kiln, DDGS 검색/안전한 HTML 수집, PostgreSQL 작업/장부, 주문/감사 Worker
- `python_worker/`: 고정 JSON 평가기. 금액 계산·Hard 판정·허용 후보 정렬. 생성 코드 실행 금지
- `frontend/`: 모의 주문 표시, 요청/답변, 조건·최종 승인, 재승인, 별도 정책 편집, 영수증
- `blockchain/`: **같은 저장소**의 `codex/blockchain-network-boilerplate` cd84fa7 원본. `src/runAudit.mjs`는 명시적 입력을 받는 신규 어댑터
- `backend/test/`: 보안/실제 PostgreSQL 통합 검증. synthetic fixture는 이 경로에만 있음
- 기본 브랜치의 `apps/`, `packages/`는 과거 데모이며 새 workspace/실행/빌드에 포함하지 않습니다. `opendesign/mockups/purchase-workspace/`는 현재 UI의 정적 디자인 산출물입니다.

명세: https://app.notion.com/p/3e9a912539f98048b6a1ef9dfe6700c9
연동 명세: https://app.notion.com/p/3eaa912539f9811fb9a1d19342371ebe

## 준비

Node.js 24, Python 3, PostgreSQL이 필요합니다.

```powershell
npm ci
Copy-Item .env.example .env
# .env의 실제 값은 로컬에서 입력. 이미 .env가 있으면 덮어쓰지 마세요.
npm run migrate
npx tsx backend/src/bootstrap.ts <owner-id> <scope-id> <검토한-policy.json> <초기-모의잔고>
npm run dev
```

- migration은 DB 소유자 권한으로 1회 실행합니다.
- bootstrap은 `DATABASE_POLICY_URL`과 명시적 정책 파일·모의 잔고를 요구합니다. 기본 사용자/상품/가격/정책을 자동 생성하지 않습니다.
- 정책 schema는 `backend/src/schema.ts`입니다. 통화는 ISO 통화 및 최소단위를 검증하며 KRW 기본입니다. 미지원/알 수 없는 강제 규칙은 거절합니다.
- `AUTH_TOKEN_HASHES`는 관리자가 발급한 32바이트 이상 난수 토큰의 SHA-256과 소유자 ID 매핑입니다. 사용자 선택만으로 로그인하는 데모 우회가 없습니다. 원문 토큰은 사용자에게 비공개로 전달하고 UI 비밀번호 입력에 넣습니다. 브라우저 영구 저장은 하지 않습니다.
- 브라우저: http://127.0.0.1:5173 / API: http://127.0.0.1:4174
- `npm start`는 빌드된 API/정적 UI를 제공합니다. 운영에서는 TLS와 동일 출처 reverse proxy를 구성해야 합니다.

## 정책 쓰기 권한 분리

일반 거래 프로세스는 `SERVICE_ROLE=agent`이며 정책 변경 API를 거절합니다. 정책 폴더를 OS/컨테이너에서 읽기 전용으로 제공하고, DB도 정책 버전 SELECT만 가능한 계정을 사용합니다.

DB 소유자로 `backend/src/db/002_roles.sql`을 적용하고 각 로그인 계정에 `team11_agent`, `team11_policy_admin`, `team11_audit` 중 해당 역할만 부여합니다. 일반 계정에는 정책 버전/활성 버전 변경 권한이 없습니다. Windows의 파일 생성 mode 값만으로 읽기 전용 격리가 완성되지는 않으므로 별도 OS 계정의 ACL 또는 컨테이너 read-only mount가 필요합니다.

정책 변경 프로세스는 별도 계정/프로세스로 실행합니다:

```powershell
$env:SERVICE_ROLE = 'policy-admin'
$env:PORT = '4175'
# 이 프로세스만 정책 발행 DB 계정 및 정책 디렉터리 쓰기 권한을 갖도록 설정
npm start
```

Vite는 `/api/policy-edit-sessions`를 4175로 연결합니다. 운영 reverse proxy도 동일 경로 분리가 필요합니다. 같은 서비스 계정으로 둘을 실행하면 OS 수준 쓰기 격리는 성립하지 않습니다. 정책 버전/영수증/결정 기록 UPDATE·DELETE는 DB trigger도 거절합니다.

같은 policy scope 잠금으로 실행 시작/재개와 정책 편집 진입을 직렬화합니다. 질문·승인 대기·미완료 감사는 정책 편집을 막습니다. 안전한 취소는 미소비 모의 예약만 해제합니다. 발행은 새 불변 파일과 digest를 만들며 과거 사용액을 초기화하지 않습니다.

## 실행 흐름

1. 요청 시작은 intent/승인 없이 가능합니다. Kiln이 9개 등록 Tool 중 필요한 작업을 선택합니다.
2. Plan은 조건 초안 → Python 예시 1–2개 → 사용자 조건 승인. HardInput은 명시 입력 일치와 Python 평가 → 사용자 조건 승인.
3. 실제 검색 결과를 선택합니다. 현재 정적 HTML Product JSON-LD를 지원하며 누락·모호한 옵션·JS-only·로그인 자료는 UNKNOWN/UNSUPPORTED_SOURCE입니다. 리뷰 진위를 보장하지 않습니다.
4. 판매 페이지에서 관측한 상품 가격과 배송비가 모두 확인된 후보만 모의 주문 계산에 사용합니다. 판매자의 확정 견적은 아닙니다. 수동 모드는 품목·금액·정책을 확인한 뒤 승인합니다.
5. 수동 모드는 승인 후 `execute_purchase`가, 자동 모드는 요청 시 고정한 한도·수량·상품명과 재평가를 통과한 `prepare_purchase`가 작업을 한 건 enqueue합니다. Worker는 같은 DB 트랜잭션에서 모의 차감·영수증·감사 작업을 한 번만 저장합니다.
6. 만료 시 재확인합니다. 재승인은 예약/승인/generation을 갱신하고, 이전 Worker를 무효화한 뒤 다시 Tool 실행을 요구합니다.
7. 미선택 Tool은 제한된 재요청 후 ACTION_REQUIRED. UI Retry/Cancel이 있으며 무한 대기하지 않습니다.

Kiln 요청마다 전체 정책을 고정 prefix로 포함합니다. 앱의 READY 캐시와 제공사 cached_tokens는 별개입니다. `REQUIRE_PROVIDER_HIT=true`는 제공사의 원자적 cache-only 보장 계약이 없으므로 실행을 차단합니다. **제공사 cache hit 100%를 보장하지 않습니다.**

## 실제 검색

검색은 DDGS의 DuckDuckGo backend를 사용하며 Brave 키는 사용하지 않습니다. 기본 판매 페이지 호스트는 `www.11st.co.kr,www.ikea.com`이며 `SOURCE_ALLOWED_HOSTS`로 교체할 수 있습니다. 일반 웹 결과는 후보에서 제외합니다. 가격은 판매 페이지 JSON-LD 관측값만 사용하며, 11번가의 명시적 무료배송 표기 또는 JSON-LD 배송비가 없으면 모의 주문 계산을 차단합니다. 가격은 5분 이내의 관측값이어야 합니다. 안전 수집은 HTTPS/443, DNS 주소 검사, 연결 IP 고정, redirect 재검증, 10초/2MiB 한도를 적용합니다. 내장 가짜 상품 목록은 없습니다.

## 실제 Sepolia 감사

- 원본 v1: KRW 정수·단일 품목·수량×단가+배송비·reviewRequired=false만 지원합니다. 다른 정책은 주문 실행 전 반려합니다.
- 모의 주문 영수증의 고정 salts/requestId/purchaseId를 사용합니다. 전체 정책 digest와 v1 policyHash는 다릅니다.
- 같은 저장소 원본 `validatePayloads`, `hashPayload`, `executeTransaction`, AuditRecord ABI를 재사용합니다.
- `SERVICE_ROLE=audit`인 **상시 signer 호스트**에만 `TRACK_RPC_URL`, `TRACK_VERIFY_RPC_URL`, 32바이트 hex `WALLET_MASTER_KEY`를 설정합니다. 사용자별 Sepolia 키는 이 호스트에서 생성해 AES-256-GCM으로 암호화 보관하며, API는 주소만 읽습니다. 기본 `AUDIT_GAS_MODE=personal`은 각 사용자 지갑의 테스트 ETH를 요구합니다. `AUDIT_GAS_MODE=relayer`에서는 같은 호스트에 `AUDIT_RELAYER_PRIVATE_KEY`를 추가하고 서비스 지갑 잔액을 두 RPC에서 확인합니다. 이때 감사 거래의 온체인 송신자는 서비스 지갑이며 사용자별 영수증은 DB의 `owner_id`로 격리됩니다. 비밀키와 master key를 Vercel 프런트·일반 에이전트에 전달하지 마세요.
- `npm run build -w sepolia-audit-boilerplate`로 원본 계약을 컴파일합니다.
- 최초 요청마다 계약 배포 + recordPurchase, 재시도는 동일 체크포인트와 서명을 복구합니다. state/evidence와 백업을 보호하고 임의 삭제하지 마세요.
- 릴레이어는 모든 사용자의 nonce를 공유하므로 DB advisory lock으로 동시 실행을 직렬화합니다. 체크포인트는 파일이므로 감사 워커는 **영구 디스크가 있는 단일 호스트**로 운영하고 복구 가능한 백업을 유지해야 합니다. Vercel Functions만으로는 상시 감사 워커가 되지 않습니다.
- Vercel API는 에이전트가 만든 모의 주문 작업을 해당 요청 안에서 처리하고, 브라우저가 열린 동안 인증된 동일 요청의 만료된 작업을 재시도합니다. 브라우저가 닫힌 뒤 중단된 작업까지 자동 복구하려면 `SERVICE_ROLE=agent` 상시 프로세스가 필요합니다. 감사 전송은 영구 체크포인트 디스크가 있는 별도 `SERVICE_ROLE=audit` 프로세스가 필요합니다. 두 프로세스는 같은 DB를 사용하며, 서명 비밀키는 audit 프로세스에만 둡니다.
- 자동 모의 주문은 요청 생성 시 명시적으로 켠 `HardInput`에만 적용됩니다. 최대 금액·수량·정확한 상품명을 필수로 받아 서버가 검색 근거와 정책을 재평가한 뒤 한 건만 작업 큐에 넣습니다. 요청 내용을 변경하면 자동 동의가 해제됩니다. 실제 상품 주문·결제는 하지 않습니다. 기존 DB에는 `backend/src/db/006_auto_purchase.sql`을 선적용해야 합니다.
- HMAC은 원본처럼 signer 개인키에서 용도별 파생되며 암호화가 아닙니다.
- 실제 receipt status=1·이벤트·두 RPC가 일치해야 verified, finalized 확인 전에는 완료가 아닙니다.
- 실제 주문/모의 여부 필드는 원본 ABI에 없으므로 체인만으로 실구매·모의 여부를 증명하지 않습니다.

## 검증

```powershell
npm run build
npm test
npm audit
```

PostgreSQL 통합 검사는 npm 패키지의 별도 테스트 클러스터를 loopback에 실행합니다(포트 55439). 운영 DB는 사용하지 않습니다. Windows에서는 pg_ctl로 정상 종료합니다. 테스트 데이터는 Git에서 제외한 `.test-state/`에 남습니다.

브라우저 검증용 `npx tsx backend/test/browserHarness.ts`는 명시적인 test fixture와 별도 DB(55440), API(4174)를 사용합니다. 기본 실행의 자동 fallback이 아닙니다. 실제 Kiln이 설정되어 있으면 실제 호출하므로 비용이 발생합니다.

## 저장 범위 및 아직 환경에서 확인할 항목

- 영구 로그는 모의 승인/반려 최소 필드만. 메시지·추론·Tool 전문·검색/리뷰 원문은 저장하지 않습니다.
- 정책/조건/출처의 최소 사실·장부/멱등키/현재 작업/영수증/감사 checkpoint는 복구용 업무 상태입니다.
- 인증 토큰·API 키·DB 비밀번호·signer는 저장소에 넣지 않습니다.
- 5,000 사용자/200 동시접속은 목표 검증 조건입니다. DB pool/LLM/검색/Python 동시성 제한은 구현했지만 운영 처리량 보장을 뜻하지 않습니다.
- 로컬에서 200개 동시 인증 조회를 검증했습니다. 이는 200개 동시 구매/LLM 요청의 처리량 검증이 아닙니다.
- 실제 DDGS 검색과 Sepolia E2E는 해당 자격증명·테스트 자금·출처 구성이 있어야 검증할 수 있습니다. 미설정은 미완료 상태로 표시합니다.

## UI 재설계 및 QA (2026-09-29)

- 구매 계획·정책 관리·모의 주문 기록을 TypeScript로 재설계했습니다. 후보 선택과 승인을 폼으로 제공하며 raw JSON/ID 입력을 요구하지 않습니다.
- `opendesign/mockups/purchase-workspace/`의 3개 HTML은 정적 디자인 자료입니다. 실행 화면은 Vite의 5173 포트입니다.
- 기존 DB도 `npm run migrate` 및 DB 소유자로 `backend/src/db/002_roles.sql` 재적용이 필요합니다. `service_health`와 오류 코드 열이 추가됩니다.
- 별도 감사 프로세스가 두 HTTPS Sepolia RPC의 체인 ID와 가스 지불 지갑의 테스트 잔액(각 조회에서 0.004 ETH 이상)을 검증해 20초마다 heartbeat를 남깁니다. 60초 이내 VERIFIED가 없으면 견적 준비·주문 실행·Worker 차감이 차단됩니다. 준비 확인 이후 장애가 나면 감사 완료를 보장하지는 않으며 작업은 복구 대기합니다.
- HTML의 판매처 표시명은 신원 증거가 아닙니다. 검증된 판매처 adapter가 없는 현재, 판매처 제한 정책은 MERCHANT_EVIDENCE_MISSING으로 차단됩니다.
- 검증 결과와 연결 한계: [재설계 QA](docs/QA-REDESIGN-2026-09-29.md).

## 오픈소스 검색 API

온라인 실행은 Supabase PostgreSQL/Auth와 Vercel Node.js/Python Functions로 연결했습니다. 개발용 접근 토큰 입력은 온라인에서 이메일 로그인으로 교체했습니다. 현재 상태·보안·남은 범위·재배포 방법은 [Supabase QA](docs/QA-SUPABASE-2026-09-29.md)를 참조하세요. SMTP/공개 회원가입 및 Sepolia 감사 Worker는 아직 별도 설정이 필요합니다.

- [deedy5/ddgs](https://github.com/deedy5/ddgs), MIT, 버전 9.16.0. Qwen 모델 전용 API가 아니라 서버가 실행하는 `search_products` 도구의 검색 제공자입니다.
- 현재 Kiln 모델은 qwen3-32b. Brave API와 Brave 엔진은 사용하지 않습니다. DuckDuckGo 엔진을 명시적으로 고정합니다.
- SearXNG도 검토했으나 현재 Docker 엔진이 동작하지 않아 Python에서 실행 가능한 DDGS를 선택했습니다.

```powershell
python -m venv .venv-search
.\.venv-search\Scripts\python.exe -m pip install -r search_service/requirements-lock.txt
.\.venv-search\Scripts\python.exe -m uvicorn search_service.app:app --host 127.0.0.1 --port 4479 --no-access-log
```

`.env`에 `SEARCH_API_URL=http://127.0.0.1:4479`를 지정한 뒤 backend를 시작합니다. 검색 API 키는 필요하지 않습니다. `SOURCE_ALLOWED_HOSTS`를 비우면 판매 페이지 후보도 비워집니다. 검색 순위·가격은 판매처의 현재 재고와 최종 결제액을 보증하지 않습니다.

검색 API는 loopback 전용, origin 차단, 본문/결과 크기 제한, 동시 검색 2개, 60초 메모리 캐시(최대 256개), 동일 검색 병합을 적용합니다. `/extract`나 외부 호출자 지정 backend는 제공하지 않습니다. 서버가 결과를 검증한 후 기존 SSRF 보호 수집기로만 원문을 가져옵니다.

이 메타검색 라이브러리는 상위 검색 서비스 상태/제한에 영향을 받으며 200명 동시 검색 처리나 운영 SLA를 보장하지 않습니다. 제한/장애는 429/503으로 차단합니다. 검색 실패를 생성 결과로 채우지 않습니다. 저장소는 교육용 사용을 명시합니다.

실제 검색 검증 결과: [DDGS QA](docs/QA-DDGS-2026-09-29.md).
