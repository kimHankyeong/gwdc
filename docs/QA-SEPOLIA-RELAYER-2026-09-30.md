# Sepolia 서비스 릴레이어 실제 전송 QA — 2026-09-30

- 격리된 PostgreSQL에서 `qa-relay-owner`의 모의 영수증·감사 작업을 만들고, 사용자 지갑은 **0개**로 유지했다. 운영 Supabase 영수증이나 사용자 지갑은 사용하지 않았다.
- `AUDIT_GAS_MODE=relayer`로 `AuditWorker.readiness()`와 `tick()`을 실행했다. 서비스 서명자 `0x7bea9B99f1C9119e1BFe799512a736C20d06BD53`가 가스를 낸 [계약 배포](https://sepolia.etherscan.io/tx/0xa643d0eef05f361e1b7e456ac2292ac36579b75b32c08b2bea99d700250fdd84)와 [감사 기록](https://sepolia.etherscan.io/tx/0xe5cca48f517e59e029e9f03a89f23a6e02dae8a26af58f7b8a630d6fc4fc6a76)을 실제 세폴리아에 전송했다.
- 워커 보고서: `verification=verified`, `receiptStatus=1`, `state=INCLUDED`, `chainId=11155111`, `ownerWalletCount=0`. Etherscan에서도 감사 기록 거래 `Success`, `From=서비스 서명자`, 이벤트 로그 1개를 확인했다.
- 서로 다른 두 RPC는 감사 거래의 `status=1`, 블록 `11808473`, 블록 해시 `0x658fc09ae549cee40ffdb6b20a5ff592a83eef6935da7828b13c2e3f084fab5f`, 로그 1개에 동의했다. 조회 시점의 finalized head는 해당 블록 이전이어서 **최종 확정은 아직 증명되지 않았다**.
- 이 실행의 가스비는 배포 `0.000374049755286229 SepETH`, 기록 `0.000052019342045453 SepETH`였다. 네트워크 수수료는 변하므로 운영 용량 추정치로 고정하지 않는다.
- 이 증거는 **릴레이어 코드의 격리된 실제 전송 검증**이다. 운영 앱은 별도 상시 서명 호스트가 없어 `/api/health`에서 `gasMode=UNAVAILABLE`, `audit=false`로 표시되며, 온라인 사용자 구매 확정에서 실제 감사가 전송됐다는 증거는 아니다.
