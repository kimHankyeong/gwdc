# frontend — PSEUDO 01 · TypeScript UI 프로토타입

Notion [`구성`](https://app.notion.com/p/3e9a912539f98023be70fe205e3ae256)과 [`PSEUDO 01 · TypeScript UI와 플래닝`](https://app.notion.com/p/3eaa912539f9817ba3fcdfb4004679d3)에서 정의한 화면 6개를 [`design-system`](./design-system)의 Trust Blue 디자인 시스템으로 구현한 UI 프로토타입입니다.

> `src/lib/mockAgentApi.ts`는 백엔드·Kiln Tool Calling 연동 전 화면 검증용 목(mock) 구현입니다. 실제 정책 게이트, 서버 승인, 온체인 기록은 없습니다. Notion 문서의 `startAgentRun` / `simulate_policy` / `prepare_purchase` / `execute_purchase` / `get_audit_status`와 같은 이름을 그대로 따르되, 로직은 클라이언트에서만 계산합니다.

## 로컬 실행

```powershell
cd frontend
npm install
npm run dev
```

`http://127.0.0.1:5180/` 에서 확인합니다.

## 화면과 상태 전이

| 화면 | 파일 | 대응 상태 |
| --- | --- | --- |
| PlanningForm | `src/features/planning/PlanningForm.tsx` | `DRAFT` |
| ClarificationPanel | `src/features/planning/ClarificationPanel.tsx` | `NEEDS_INPUT` |
| PolicyViewer | `src/features/policy/PolicyViewer.tsx` | `CONSTRAINTS_DRAFT` (좌측) |
| SimulationPanel | `src/features/policy/SimulationPanel.tsx` | `CONSTRAINTS_DRAFT` (우측) |
| FinalApproval | `src/features/purchase/FinalApproval.tsx` | `READY` → `EXECUTING` → `COMPLETED` |
| (반려 카드) | `src/features/planning/PlanningPage.tsx` 내부 | `REJECTED` |

`PlanningPage.tsx`가 오케스트레이터로서 상태에 따라 위 화면을 교체합니다. Notion 문서의 "render server state: NEEDS_INPUT / CONSTRAINTS_DRAFT / POLICY_NOT_READY / READY / REJECTED" 매핑을 그대로 따릅니다.

## 시연 시나리오

1. 구매 품목에 **"아무거나"** 또는 빈 값을 넣고 제출 → `NEEDS_INPUT`으로 되묻기.
2. **"양파 10kg"**처럼 카탈로그 품목명을 포함해 제출 → `CONSTRAINTS_DRAFT`. 왼쪽에 Hard Constraint(읽기 전용), 오른쪽에 시뮬레이션 버튼.
3. 시뮬레이션 실행 → 판매처 후보 1~2곳과 선정/제외 근거(reasonCode)를 확인. 수량을 크게 잡으면(예: 200) 단일 거래 한도 초과로 모두 제외되어 `REJECTED`가 되는 것도 확인할 수 있습니다.
4. 후보 수락 → `FinalApproval`에서 품목·판매처·금액·정책 digest 확인 후 "구매 확정" → 영수증과 감사(audit) 상태가 두 번의 제한된 폴링 후 "온체인 확정"으로 바녵니다.

## 구현 경계 (Notion 문서 기준)

- 브라우저 값은 신뢰하지 않는다는 원칙을 프로토타입에서는 "서버가 다시 확인한다"는 문구로만 남겨 두었습니다. 실제 재검증 로직은 백엔드 연동 시 추가합니다.
- 정책 원문은 `PolicyViewer`에서 항상 읽기 전용입니다. 이 화면에는 저장·수정 액션이 없습니다.
- 감사 상태 폴링은 최대 2회로 제한합니다(`FinalApproval.tsx`의 `MAX_TICKS`).
