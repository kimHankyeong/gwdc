# 프랜차이즈 식자재 발주 에이전트

Node.js 24, TypeScript, React/Vite, Fastify, SQLite, Solidity/Hardhat로 만든 챌린지 B 발주·지출 통제 시연 골격입니다. 기본 구동은 로컬 시뮬레이션이며 실제 자금 이동은 없습니다. 원문 필수인 Kiln 및 gpt-oss-120b 조건은 이 구현에서 제외했습니다.

## UI First Draft

`ui-first-draft` 브랜치는 기존 기능과 API 계약을 유지하면서 화면 구조를 다시 설계한 첫 번째 UI 제안입니다. 핵심 원칙은 **필요한 판단과 행동만 먼저 보여주고, 나머지는 사용자가 요청할 때 드러내는 것**입니다.

- 화면을 카드로 채우지 않고 여백과 타이포그래피로 정보의 우선순위를 구분합니다.
- 역할마다 필요한 메뉴만 노출합니다. 본사는 `운영 · 정책 · 기록`, 지점은 `구매 요청 · 구매 기록`만 봅니다.
- 공급업체 조건, 정책 원문, 감사 이벤트, 거래 증빙은 접힌 상세 영역에 둡니다.
- 각 화면에는 하나의 중심 질문과 하나의 주 행동만 남깁니다.
- 상태색은 정상·주의·중단처럼 의미가 있는 경우에만 제한적으로 사용합니다.
- 데스크톱과 모바일에서 같은 정보 순서와 조작 방식을 유지합니다.

### 화면 구성

| 역할 | 화면 | 처음 보이는 정보 | 상세 영역으로 숨긴 정보 |
| --- | --- | --- | --- |
| 본사 | 운영 | 전체 예산, 사용액, 요청 수, 지점별 잔액 | 지점 정책 상세, 최근 구매 활동 |
| 본사 | 정책 | 지점 선택, 예산, 저장 행동 | 허용 공급업체, 만료일, 전체 정책, 중단 행동 |
| 본사 | 기록 | 공급업체, 일시, 상태, 금액 | 요청 품목, 정책 근거, 트랜잭션과 영수증 |
| 지점 | 구매 요청 | 사용 가능 예산, 품목과 수량, 구매안 만들기 | 생성 제공자, 적용 중인 구매 규칙 |
| 지점 | 구매 기록 | 구매 결과 목록 | 실행 단계, 정책 근거와 증빙 |

### 프런트엔드 구조

```text
apps/web/src/main.tsx
└─ QuietApp.tsx                    세션, 역할별 내비게이션, 새로고침, 주문 상태 폴링
   ├─ QuietHeadquartersPanel.tsx   본사 운영 현황과 정책 편집
   ├─ QuietOrdersPanel.tsx         지점 구매 요청 작성
   └─ QuietLedgerPanel.tsx         역할별 구매 기록

apps/web/src/minimal-ui.css        UI First Draft 전용 반응형 스타일
apps/web/src/api.ts                기존 API 클라이언트 재사용
apps/web/src/Visual.tsx             기존 상태·피드백 컴포넌트 재사용
```

기존 `App.tsx`, `HeadquartersPanel.tsx`, `OrdersPanel.tsx`, `LedgerPanel.tsx`는 비교와 복구를 위해 그대로 보존했습니다. `main.tsx`만 새 UI 진입점인 `QuietApp`을 선택합니다.

### 현재 검증 상태

- 전체 TypeScript 타입 검사 통과
- Vite 프로덕션 웹 빌드 통과
- 본사 운영·정책·기록과 지점 구매 요청·기록 흐름 확인
- 390px 모바일 폭에서 레이아웃과 수평 오버플로 확인
- 키보드 포커스, 의미 있는 랜드마크, 입력 레이블, 현재 메뉴 표시 적용

이 브랜치는 시각 방향과 정보 구조를 검증하기 위한 초안입니다. 운영 반영 전에는 공통 UI 프리미티브 추출, 기존·신규 CSS 통합, 실제 인증, 정식 WCAG 검사와 브라우저 회귀 테스트가 추가로 필요합니다.

## 로컬 실행

Windows PowerShell에서 저장소 루트 기준:

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

웹은 `http://127.0.0.1:5173`, API는 `http://127.0.0.1:4174`에서 엽니다. 본사 운영팀 또는 가맹점 계정을 골라 로그인합니다. `.env`의 기본값은 안전한 로컬 시뮬레이션이며 앱에서 `명시적 데모 발주안`을 선택해야 규칙 기반 발주안을 사용합니다. Codex CLI가 기본 제공자입니다. Claude는 설치·인증 후 선택할 수 있습니다. CLI 실패는 결제 없이 기록됩니다.

## 프로젝트 명령

```powershell
npm run typecheck
npm run build:web
npm run build
npm test
npm run screenshots
```

`npm run typecheck`는 공유 타입, API, 웹의 TypeScript를 검사하고, `npm run build:web`은 웹 프로덕션 번들을 생성합니다. `npm run build`는 여기에 Hardhat 계약 빌드까지 포함합니다. `npm test`는 공유 스키마, API 권한·멱등성·예산·중단·CLI 파서, 계약 정책 테스트를 실행합니다. UI 스크린샷은 Playwright Chromium이 필요합니다. 설치되지 않았다면 `npx playwright install chromium`을 실행합니다.

시연 화면은 `artifacts/screenshots/`에 저장합니다. 본사 정책, 발주 성공, 예산 초과 차단, 에이전트 중단 상태가 포함됩니다.

## 역할과 시연 데이터

- 본사 운영팀: 지점별 예산·허용 공급업체·만료 정책을 승인하고 에이전트를 중단합니다.
- 가맹점 직원: 품목·수량을 요청하고 정책 근거 및 처리 상태를 확인합니다.
- 거래 원장: 정책·실행 단계·차단 사유·영수증 JSON을 확인합니다.
- 모든 계정, 품목 가격, 잔액, 모의 KRW(`DKRW`)는 합성 데이터입니다. 계약 가스는 테스트 네이티브 자산이며 DKRW와 별도로 기록됩니다.
- demo 공급자는 규칙 기반이며 토큰·전력 수치를 만들지 않습니다. 실제 CLI의 실행시간과 제공된 사용량만 기록합니다.

## CLI 공급자

`LLM_PROVIDER=codex|claude`로 기본 제공자를 선택합니다 (`codex` 기본). 실행 파일은 `CODEX_BIN`, `CLAUDE_BIN`에서 지정할 수 있습니다. Codex CLI에는 읽기 전용 sandbox 및 JSON 출력 스키마를, Claude CLI에는 JSON 스키마와 도구 제한을 적용합니다. 프롬프트는 stdin으로 전달되고 임시 폴더별 격리됩니다. 서명 키는 CLI 환경에 전달하지 않습니다. 미설치·미인증·시간 초과·스키마 오류는 실패로 표시되고 정책 검증·결제까지 진행하지 않습니다.

시뮬레이션을 쓰지 않고 CLI에 연결할 경우 `.env`에서 `ALLOW_DEMO_PROVIDER=false`로 설정하세요. CLI 실행 환경이 Windows에서 PATH에 없다면 `CODEX_BIN`/`CLAUDE_BIN`에 해당 실행 래퍼의 절대 경로를 설정할 수 있습니다.

## 계약과 프라이빗 체인

`DemoKRW`는 0 decimals의 테스트 전용 ERC-20이고, `AgentBudgetVault`는 지점 권한, 허용 공급업체, 만료, 중단, 배송비 포함 누적 예산 및 중복 주문을 확인합니다. 실제 RPC 연결은 `.env`의 `CHAIN_PROVIDER=rpc`, 배포 주소, 지점 signer 및 supplier wallet 설정이 필요합니다. 키를 저장소에 넣지 말고 로컬 비밀 저장소를 사용하세요. RPC URL은 loopback만 허용하도록 서버에서 제한됩니다.

4개 검증 노드는 Docker 없이 Ubuntu WSL/Linux의 Besu에서 실행하도록 준비했습니다. 현재 환경에서 Besu가 설치되지 않아 네트워크 실행·합의는 검증하지 않았습니다.

```bash
npm run besu:prepare
npm run besu:start
npm run besu:stop
```

먼저 Ubuntu WSL 안에 Java와 Besu를 설치하고 `besu`가 PATH에 있는지 확인하세요. `prepare`는 Besu의 blockchain config 생성 명령으로 개발용 validator 키 4개를 만들고 로컬 전용 폴더에 저장합니다. 키·데이터 디렉터리는 gitignore에 포함했습니다. 모든 노드의 P2P와 HTTP RPC는 `127.0.0.1`에 바인딩되며 RPC 포트는 8545–8548입니다. 이 설정을 공용 네트워크나 실자산에 쓰지 마세요.

## 제한 사항

- 모의 체인은 트랜잭션 해시를 만들지 않습니다. 영수증은 시뮬레이션 모드와 온체인 증빙 부재를 명시합니다.
- 테스트는 계약과 정책 흐름을 검증하며 Besu 바이너리의 설치·4노드 합의 동작까지 증명하지 않습니다.
- 보일러플레이트의 로컬 역할 계정은 인증 데모용이며 운영 배포용 계정 시스템이 아닙니다. 운영 네트워크에 노출하지 마세요.
- 킬른(Kiln), gpt-oss-120b, 실제 결제망은 구현하지 않았습니다.

## 디자인 시스템

새 디자인 시스템 문서는 `opendesign/design-systems/franchise-procurement/README.md`에 있습니다. 제품 화면에 공유 토큰을 직접 연결했습니다. 시연 결과와 화면 구조는 `opendesign/design-systems/franchise-procurement/ui-kit-franchise-procurement/`에서 확인할 수 있습니다.
