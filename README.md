# Sepolia 감사 기록 보일러플레이트

Solidity 계약 하나로 정책 해시와 거래 해시를 Sepolia에 기록하고 검증합니다. 앱·DB 연동 및 실제 결제 없이 체인만 테스트합니다. 자체 블록체인 노드를 구축하는 프로젝트는 아닙니다.

## 실행

Node.js 24에서:

```powershell
npm ci
npm test
Copy-Item .env.sepolia.example .env.sepolia
# .env.sepolia에 테스트 전용 개인키 설정 및 지갑에 Sepolia ETH 확보
npm run test:sepolia
```

기존 `.env.sepolia`가 있다면 복사 단계는 생략합니다. HTTPS RPC와 Sepolia 체인 ID `11155111`만 허용합니다. 키 파일은 Git에서 제외합니다.

## 계약과 검증

- `recordPurchase(bytes32 purchaseId, bytes32 policyHash, bytes32 recordHash)`
- 배포자만 호출 가능하며 빈 해시·중복 ID는 거절합니다.
- ID의 중복 여부를 상태에 저장하고 두 해시는 `PurchaseRecorded` 이벤트에 기록합니다.
- 스크립트는 식별 정보가 없는 고정 테스트 데이터와 임의 salt를 해싱합니다. 원문 데이터와 salt는 체인에 전송하지 않습니다.
- 배포 → 기록 → 성공 영수증·이벤트·해시 대조 → 중복·비인가 호출 거절을 검사합니다. 거절 검사는 `eth_call`로 수행합니다.

`state/`의 로컬 체크포인트에 서명된 트랜잭션을 전송 전에 저장합니다. 같은 폴더에서 재실행하면 기존 배포·기록을 확인합니다. 신규 테스트는 별도 체크아웃과 새 `state/`에서 실행하세요. 온체인 성공은 1블록 포함 기준이며 최종 확정성 검증은 범위 밖입니다.

## 확인된 결과

- 계약: `0xeAb39b0e230Bb375Ca042976c958d20f44ebfd86`
- [성공한 기록 트랜잭션](https://sepolia.etherscan.io/tx/0x2691b19fde374b5d0d0ab4b7b2354b803adbbd60c39c1cc937741302aaeace91)
- [검증 결과](evidence/sepolia-audit-verification.json), [탐색기 화면](evidence/sepolia-audit-success.png)

이 결과는 합성 감사 데이터의 독립 체인 테스트입니다. 처리량·운영 보안·기존 서비스 연동을 검증한 결과는 아닙니다.
