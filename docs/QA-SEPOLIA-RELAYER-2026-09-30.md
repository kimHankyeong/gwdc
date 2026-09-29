# Sepolia 서비스 릴레이어 실제 전송 QA — 2026-09-30

- 격리된 PostgreSQL에서 `qa-relay-owner`의 모의 영수증·감사 작업을 만들고, 사용자 지갑은 **0개**로 유지했다. 운영 Supabase 영수증이나 사용자 지갑은 사용하지 않았다.
- `AUDIT_GAS_MODE=relayer`로 `AuditWorker.readiness()`와 `tick()`을 실행했다. 서비스 서명자 `0x7bea9B99f1C9119e1BFe799512a736C20d06BD53`가 가스를 낸 [계약 배포](https://sepolia.etherscan.io/tx/0xa643d0eef05f361e1b7e456ac2292ac36579b75b32c08b2bea99d700250fdd84)와 [감사 기록](https://sepolia.etherscan.io/tx/0xe5cca48f517e59e029e9f03a89f23a6e02dae8a26af58f7b8a630d6fc4fc6a76)을 실제 세폴리아에 전송했다.
- 워커 보고서: `verification=verified`, `receiptStatus=1`, `state=INCLUDED`, `chainId=11155111`, `ownerWalletCount=0`. Etherscan에서도 감사 기록 거래 `Success`, `From=서비스 서명자`, 이벤트 로그 1개를 확인했다.
- 서로 다른 두 RPC는 감사 거래의 `status=1`, 블록 `11808473`, 블록 해시 `0x658fc09ae549cee40ffdb6b20a5ff592a83eef6935da7828b13c2e3f084fab5f`, 로그 1개에 동의했다. 조회 시점의 finalized head는 해당 블록 이전이어서 **최종 확정은 아직 증명되지 않았다**.
- 이 실행의 가스비는 배포 `0.000374049755286229 SepETH`, 기록 `0.000052019342045453 SepETH`였다. 네트워크 수수료는 변하므로 운영 용량 추정치로 고정하지 않는다.
- 위 실행은 **파일 체크포인트 방식의 격리 검증**이다. 이후 Supabase 체크포인트 방식에서도 격리 DB로 [배포](https://sepolia.etherscan.io/tx/0xd4eb7f9c4a9aedc9f064d5eb9af60cb87220b1503d7c7d0b90d724fd9277d142)와 [기록](https://sepolia.etherscan.io/tx/0x3677b9a824c78653b5bdaa229d5b549f5a664df8afd53efe17aebcc3d5cb2f2a)을 실제 전송했다. 저장된 체크포인트로 같은 요청을 재실행했을 때 두 거래 해시가 그대로 유지됐다.

## Vercel + Supabase 운영 경로

- 운영 Supabase에 감사 체크포인트와 권한이 제한된 `team11_web_audit` 로그인 역할을 설치했다. 세션 풀러 포트 5432의 advisory lock으로 서비스 서명자의 nonce를 직렬화한다.
- Vercel 감사 함수가 격리된 모의 영수증을 처리해 [감사 거래](https://sepolia.etherscan.io/tx/0xae81fdd0a79131bb693ad31ee001906b82173363fce9fe398ca274d9f750c4fa)를 전송했다. 운영 DB 보고서는 `receiptStatus=1`, `verification=verified`, `state=INCLUDED`이고 서명자는 위 서비스 주소다. 인증된 체크포인트와 보고서가 DB에 저장됐다. 동일 요청 재실행에서 거래 해시는 변하지 않았다.
- 운영 `/api/health`는 `gasMode=RELAYED`, `audit=VERIFIED`를 반환했고, 브라우저 설정 화면에서도 `감사 연결: 연결 준비됨`, `가스 지불: 서비스 대납`을 확인했다. 비인증 감사 함수·상태 요청은 401을 반환한다.
- Vercel의 유한 실행 시간에 맞춰 로그인 사용자 요청에서 준비 상태를 갱신하고, 모의 주문 확정 후 감사 함수를 호출한다. DB 체크포인트와 서명자 잠금이 재시도의 동일 거래 재사용을 보장한다. 보류 중이던 개인 지갑 요청도 감사 전용 계정으로 처리되어 설정 화면에 계정별 주소가 표시됐다.
- 운영 QA 영수증은 실제 판매처 주문이나 결제가 없는 **격리된 모의 데이터**다. 일반 사용자 구매 플로우 전체에서 생성된 영수증은 아니며, 해당 거래의 최종 확정은 조회 시점에 아직 확인되지 않았다.
