# Sepolia 해시 기록 실행 코드

정책·거래 해시를 Solidity 계약에 기록하는 독립 실행 코드입니다. 현재 입력은 스크립트의 합성 샘플이며 앱이나 실제 결제와 연결되지 않습니다.

## 실행

Node.js 24에서 실행합니다.

```powershell
npm ci
Copy-Item .env.sepolia.example .env.sepolia
# 테스트 전용 개인키와 Sepolia RPC 설정, 지갑에 테스트 ETH 확보
npm start
```

기존 `.env.sepolia`가 있으면 복사를 생략합니다. `TRACK_AUDIT_REQUEST_ID`는 재시도 시 유지하고, 의도적으로 새 기록을 만들 때만 변경합니다. 새 요청은 계약 배포와 기록을 수행하며 같은 요청의 재실행은 저장된 거래를 재사용합니다.

## 파일

- `contracts/AuditRecord.sol`: 해시 기록, 중복 ID 차단, 소유권 이전, 일시 중지
- `scripts/record-purchase.mjs`: 실행 흐름, 계약 연결, 결과 출력
- `scripts/audit-safety.mjs`: 입력·서명·체크포인트·RPC 응답 검사
- `scripts/audit-transaction.mjs`: 서명 저장, 전송, 장애 복구

실행에 필요한 보안 검사는 유지합니다. 테스트·감사 보고서·이미지는 저장소에 포함하지 않습니다. 개인키는 `.env.sepolia`, 재실행 상태는 `state/`, 실행 결과는 `evidence/`에 보관하며 모두 Git에서 제외합니다. 원문·salt·체크포인트는 접근 통제된 별도 백업을 유지하세요.

성공 보고서의 `included`는 블록 포함, `finalized`는 두 RPC로 최종 확정을 확인한 상태입니다. 오류가 발생하면 같은 요청 ID로 재실행하세요. 최대 수수료는 거래당 `0.002 Sepolia ETH`입니다.
