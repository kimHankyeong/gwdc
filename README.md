# 프랜차이즈 식자재 발주 에이전트

Node.js 24, TypeScript, React/Vite, Fastify, SQLite, Solidity/Hardhat로 만든 챌린지 B 발주·지출 통제 시연 골격입니다. 기본 구동은 로컬 시뮬레이션이며 실제 자금 이동은 없습니다. 원문 필수인 Kiln 및 gpt-oss-120b 조건은 이 구현에서 제외했습니다.

## 로컬 실행

Windows PowerShell에서 저장소 루트 기준:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

웹은 `http://127.0.0.1:5173`, API는 `http://127.0.0.1:4174`에서 엽니다. 본사 운영팀 또는 가맹점 계정을 골라 로그인합니다. `.env`의 기본값은 안전한 로컬 시뮬레이션이며 앱에서 `명시적 데모 발주안`을 선택해야 규칙 기반 발주안을 사용합니다. Codex CLI가 기본 제공자입니다. Claude는 설치·인증 후 선택할 수 있습니다. CLI 실패는 결제 없이 기록됩니다.

## 프로젝트 명령

```powershell
npm run build
npm test
npm run screenshots
```

`npm run build`는 공유 타입, API, 웹, Hardhat 계약을 빌드합니다. `npm test`는 공유 스키마, API 권한·멱등성·예산·중단·CLI 파서, 계약 정책 테스트를 실행합니다. UI 스크린샷은 Playwright Chromium이 필요합니다. 설치되지 않았다면 `npx playwright install chromium`을 실행합니다.

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
