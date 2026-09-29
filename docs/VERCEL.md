# Vercel 배포

- 운영 주소: https://gwdc-team11.vercel.app
- Vercel 프로젝트: `gwdc-team11` (Node.js 24.x)
- 이 저장소 루트가 아니라 `.test-state/vercel-site`를 배포한다. `scripts/prepare-vercel.mjs`가 프런트엔드와 서버리스 엔트리, `backend/dist`, Python 검색 모듈 및 인증서를 모은다.

## 검색 요청 경로

- `/api/*`는 `api/gateway.mjs`를 거쳐 `backend/src/cloud.ts`가 구성한 Fastify API로 전달된다.
- 상품 검색은 `backend/src/searchAgent.ts`의 LangChain 에이전트가 도구를 선택하고 후보를 검증한다. Kiln 호환 API 연결은 `backend/src/kiln.ts`가 맡고 `KILN_API_KEY`, `KILN_MODEL`은 Vercel 환경변수에서 읽는다.
- 서버리스 `api/compute.py`는 `INTERNAL_API_SECRET`으로 보호된 내부 요청만 받고 평가·검색을 실행한다. 일반 검색 공급자 코드는 `search_service/providers.py`를 쓴다. 11번가와 IKEA는 승인된 호스트에 대해 앱에서 공식 상품 페이지를 다시 확인한다.
- Vercel Functions의 유한 실행 시간에 맞춰 요청 안에서 실행한다. 장시간 상주 작업이나 영속 파일 저장소가 필요한 감사 워커는 별도 호스트가 필요하다.

## 배포

```powershell
npm run deploy:app
```

최초 1회 또는 staging 디렉터리를 새로 만든 뒤에는 대상 프로젝트를 연결한다.

```powershell
node scripts/prepare-vercel.mjs
vercel link --yes --project gwdc-team11 --cwd .test-state/vercel-site
npm run deploy:app
```

준비 스크립트는 `.env*`, 로컬 DB·정책 파일 및 QA 자격증명을 복사하지 않는다. Vercel Production 환경변수는 프로젝트에서 관리한다. Preview 환경변수는 별도 설정이므로, 운영 비밀값을 Preview에 복사하지 말고 전용 환경 구성을 사용한다.

## 필수 운영 설정

- API 런타임: `DATABASE_URL`, `SUPABASE_URL`, `INTERNAL_API_SECRET`, `PUBLIC_APP_ORIGIN`
- 인증·검색 모델: Supabase 인증 설정, `KILN_API_KEY`, `KILN_MODEL`
- Python 내부 실행: API와 같은 `INTERNAL_API_SECRET`
- 프런트엔드 공개 설정: `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (또는 현재 Supabase 공개 키 호환 변수)
- 감사 함수: `AUDIT_DATABASE_URL`, `CRON_SECRET`, `AUDIT_TRIGGER_SECRET`; 릴레이어 모드에서는 `TRACK_RPC_URL`, `TRACK_VERIFY_RPC_URL`, `WALLET_MASTER_KEY`, `AUDIT_RELAYER_PRIVATE_KEY`

비밀값은 저장소나 브라우저 번들에 두지 않는다. 현재 검색 경로는 외부 URL을 클라이언트 입력으로 받지 않으며, 내부 계산 함수는 Bearer 비밀값을 요구한다.

## 검증

- 백엔드 TypeScript 빌드와 생성 staging 디렉터리의 Vite 프로덕션 빌드를 확인한다.
- 배포 후 `/`, `/api/health`, 인증된 내부 검색 경로를 확인한다. 운영 검색 반복 결과와 후보 검증 사례는 [검색 QA 기록](QA-DDGS-2026-09-29.md)에 남긴다.
- 프런트엔드 화면 변경이 포함되면 데스크톱·모바일 화면을 캡처해 레이아웃과 동작을 확인한다.
