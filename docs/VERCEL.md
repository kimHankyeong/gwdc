# Vercel 배포

- 주소: https://gwdc-team11.vercel.app
- 정적 OpenDesign 목업이 아닌 `frontend/src` TypeScript 앱을 배포한다.
- 디자인 참조: https://busro-itda.vercel.app/?review=rights-20260910 (흰 면, 초록 포인트, 얇은 선, Pretendard). 여행 데이터·지도·브랜드 자산은 복사하지 않는다.

## 현재 실행 범위

- 화면, 메뉴, 회색 말풍선 튜토리얼은 배포된 앱에서 실행된다.
- **온라인 검색·정책·거래 실행은 아직 불가능하다.** 온라인 DB/실행 서버가 미연결이며 `/api/health`는 503 `BACKEND_NOT_CONFIGURED`를 반환한다. UI도 이를 표시하고 토큰 제출을 비활성화한다.
- 기존 로컬 Fastify 런타임은 PostgreSQL, Python 평가/검색, 정책 파일, 상주 구매/감사 Worker가 필요하다. 이 프로세스를 Vercel 함수에 그대로 올려 상시 동작한다고 가정하지 않는다.
- 실제 Sepolia signer/테스트 자금도 별도로 필요하다. 체인 실행 완료를 주장하지 않는다.

## 배포 명령

```powershell
node scripts/prepare-vercel.mjs
vercel link --yes --project gwdc-team11 --cwd .test-state/vercel-site
vercel deploy --prod --yes --cwd .test-state/vercel-site
```

준비 스크립트는 frontend 소스·패키지·API gateway·설정만 별도 디렉터리로 복사한다. `.env`, 로컬 정책/DB, signer 자료, QA 토큰은 복사하지 않는다. Vercel CLI가 생성하는 `.env.local`도 업로드 제외다.

## 서버 연결 계약

- Vercel 서버 환경변수 `BACKEND_API_ORIGIN`: 거래 API의 인증된 HTTPS origin.
- `POLICY_API_ORIGIN`: 별도 권한으로 실행되는 정책 관리 API의 HTTPS origin.
- gateway는 브라우저의 Bearer 토큰을 해당 고정 origin에만 전달한다. 임의 URL, 리디렉션, 경로 탐색은 허용하지 않는다.
- 정책 API는 일반 거래 API로 fallback하지 않는다. 미설정/장애 시 차단한다.
- Vercel만으로 전체 백엔드를 실행하려면 영속 DB/정책 저장과 작업 실행 구조를 별도로 전환하고 검증해야 한다. 현재 gateway 배포를 그 전환의 완료로 간주하지 않는다.

## 검증

- Vercel production build 통과, alias 연결.
- 1440px PC / 390px 모바일 / 320px 캡처 독립 검수 통과. 320px에서 가로 넘침 없음.
- 실배포 튜토리얼 열기/닫기 확인.
- gateway의 미설정 503, 잘못된 경로 404, 미지원 메서드 405 차단 확인.
