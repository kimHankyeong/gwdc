# Sepolia 실제 감사 전송 QA — 2026-09-29

## 확인된 결과

- 기존 `validatePayloads` → `hashPayload` → `runAuditWithInput` 코드로 고정된 **모의 주문 감사**를 실제 Sepolia에 전송.
- 계약 배포: [0xcc2c…68a31a](https://sepolia.etherscan.io/tx/0xcc2c5951939d3433b3330fb41c502ace4135aeca9e0839d5f7cc13dc7668a31a).
- 감사 기록: [0x9557…ca4230](https://sepolia.etherscan.io/tx/0x95577b0ec76a69c15989f226514c845794d574718afb446389a8b8b022ca4230). Etherscan `Success`, Sepolia chainId 11155111, 블록 11808192, receipt status 1.
- 서로 다른 두 RPC(`ethereum-sepolia-rpc.publicnode.com`, `sepolia.gateway.tenderly.co`)가 영수증·블록·이벤트와 온체인 기록 상태에 동의. 원본 코드가 `verification=verified`, `finality=included`를 반환. [원본 보고서](evidence/sepolia-audit-20260929.json).
- 동일한 `requestId`와 checkpoint를 재실행해도 기록 거래 해시가 그대로 유지됨. 추가 전송 로그는 발생하지 않음.
- Etherscan 렌더링 스크린샷: `C:/Users/user/.codex/visualizations/2026/09/29/01a0eb39-368d-7622-b9cd-7b0c88af607e/sepolia-audit-success.png`.

## 범위와 운영 상태

- 이 거래는 고정된 테스트 모의 주문 데이터(1개 × 100 KRW)를 사용한 **독립 검증**. 운영 앱 사용자 구매 확정과 연결된 거래가 아니다.
- 운영에는 `TRACK_RPC_URL`, `TRACK_VERIFY_RPC_URL`, `WALLET_MASTER_KEY`가 설정된 별도 `SERVICE_ROLE=audit` signer 호스트가 없다. 사용자별 핫월렛 구현 이후에도 운영 화면의 ‘감사 연결 미준비’ 및 구매 차단은 그대로 유지된다. 이 독립 검증에 사용한 예전 단일 지갑 키는 운영 개인 지갑으로 사용하지 않는다.
- `finality=included`는 블록 포함과 성공을 뜻한다. 원본 코드가 확인하는 Ethereum finalized head 도달까지는 별도 확인이 필요하다.
- 테스트 지갑 `0x7bea9B99f1C9119e1BFe799512a736C20d06BD53`의 개인키는 Git 제외 위치에서 현재 Windows 사용자 DPAPI로 보호. 별도 signer 호스트로 이전할 때는 전용 키·자금·지속 저장소·분리된 DB 권한을 구성해야 한다.
- 실제 상품 주문·결제·배송은 발생하지 않았다.

## 자금과 외부 검증

- [Google Cloud faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)에서 테스트 지갑으로 0.05 SepETH 지급. [자금 지급 거래](https://sepolia.etherscan.io/tx/0x3b616d44ec1e375329738cd3e207b987799b7f86b75a2f0444bb4367908a7ddd). 두 RPC가 잔고 반영을 확인한 후 감사 전송.
- [QuickNode faucet](https://faucet.quicknode.com/ethereum/sepolia)은 해당 신규 지갑의 메인넷 잔고가 없다고 거절. PoW faucet 세션은 최소 수령량 미달로 실패했으며 종료했다.
