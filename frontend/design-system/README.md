# GWDC Design System — Trust Blue

프랜차이즈 구매·발주 에이전트(GWDC) 제품 전반에 쓰는 디자인 시스템입니다. Notion 기획 문서 [`구성`](https://app.notion.com/p/3e9a912539f98023be70fe205e3ae256)과 [`PSEUDO 01 · TypeScript UI와 플래닝`](https://app.notion.com/p/3eaa912539f9817ba3fcdfb4004679d3)에서 정의한 정책·에이전트 흐름을 화면으로 옮기는 데 쓰는 토큰·컴포넌트를 담았습니다.

## 1. 디자인 컨셉과 시각적 계층 구조

- **컨셉**: 세련되고 신뢰감을 주는 푸른색 계열. 사용자의 자금과 구매 승인을 다루는 화면이므로, 채도 높은 색을 넓은 면적에 쓰지 않고 흰색·중립색 위에 **의미 있는 지점에서만** 파란색 강조를 씁니다.
- **시각적 계층**:
  1. **판단 정보** (예산, 반려 사유, 최종 금액)는 큰 숫자 타이포(`--text-numeric-lg`)와 여백으로 최상단에 둡니다.
  2. **주 행동 버튼**(승인, 시뮬레이션, 확인)은 화면당 하나만 Primary 색으로 강조합니다.
  3. **보조 정보**(정책 원문, 추가 설정, 실행 로그)는 접힌 상세 영역(`<details>` 패턴)이나 Ghost 버튼 뒤로 숨깁니다.
  4. **상태색**(성공/경고/위험)은 정책 판단 결과에만 한정해서 사용하고, 장식 목적으로 쓰지 않습니다.

## 2. 컬러 팔레트

### Primary — Trust Blue
| 토큰 | Hex | 용도 |
| --- | --- | --- |
| `primary-50` | `#eff5ff` | 강조 배경(hover/selected 배경) |
| `primary-100` | `#dbe8fe` | 배지·태그 배경 |
| `primary-300` | `#93b8fb` | 보조 보더 |
| `primary-500` | `#3b75ee` | 링크, 보조 강조 |
| **`primary-600`** | **`#1f5ad6`** | **브랜드 기본색.** 주 버튼, 포커스, 선택 상태 |
| `primary-700` | `#1a48b0` | 버튼 Hover |
| `primary-800` | `#1a3d8c` | 버튼 Active |
| `primary-900` | `#1a356f` | 강조 텍스트(다크 배경 위) |

### Secondary — Deep Navy
| 토큰 | Hex | 용도 |
| --- | --- | --- |
| `secondary-50` | `#f1f5fa` | 사이드바/헤더 배경(라이트) |
| `secondary-300` | `#9fb2ca` | 보조 아이콘 |
| `secondary-500` | `#4a6485` | 보조 텍스트(다크 표면 위) |
| **`secondary-700`** | **`#1e3a5f`** | **사이드바/헤더 배경, 강조 텍스트** |
| `secondary-900` | `#0b1b31` | 최고 대비 다크 배경 |

### Neutral — Cool Slate
| 토큰 | Hex | 용도 |
| --- | --- | --- |
| `neutral-0` | `#ffffff` | 카드/표면 배경 |
| `neutral-50` | `#f7f9fc` | 페이지 배경 |
| `neutral-100` | `#eef2f7` | 비활성/보조 배경 |
| `neutral-200` | `#e1e7ef` | 기본 보더 |
| `neutral-300` | `#c9d2de` | 입력창 보더, 강조 보더 |
| `neutral-400` | `#97a3b4` | placeholder, 비활성 텍스트 |
| `neutral-500` | `#6b7789` | 3차 텍스트 |
| `neutral-600` | `#4e596a` | 보조 텍스트 |
| `neutral-700` | `#36414f` | 본문 강조 |
| `neutral-900` | `#121821` | 기본 텍스트 |

### Semantic
| 토큰 | Hex | 용도 |
| --- | --- | --- |
| `success-600` | `#0b7a54` | 승인/정상 |
| `warning-600` | `#b45309` | 주의/재확인 필요 |
| `danger-600` | `#d1344b` | 반려/Hard Constraint 위반 |
| `danger-700` | `#b0263b` | 위험 버튼 Hover |

전체 값은 [`tokens/tokens.css`](./tokens/tokens.css)(CSS 변수)와 [`tailwind/theme.css`](./tailwind/theme.css)(Tailwind v4 `@theme`)에 있습니다.

## 3. 타이포그래피 (8pt 그리드)

| 스타일 | 크기/행간 | 굵기 | 용도 |
| --- | --- | --- | --- |
| `display` | 32 / 40 | 700 | 랜딩·빈 상태 헤드라인 |
| `h1` | 24 / 32 | 700 | 페이지 제목 |
| `h2` | 20 / 28 | 600 | 섹션 제목 |
| `h3` | 18 / 24 | 600 | 카드 제목 |
| `body-lg` | 16 / 24 | 400 | 리드 문장 |
| `body` | 14 / 20 | 400 | 기본 본문 |
| `label` | 14 / 20 | 500 | 폼 라벨, 버튼 텍스트 |
| `caption` | 12 / 16 | 400 | 보조 설명, 타임스탬프 |
| `numeric-lg` | 28 / 36 | 700 | 금액·예산 강조 숫자(tabular-nums) |

폰트는 `Pretendard Variable`을 기본 산세리프로, 금액·정책 digest·트랜잭션 ID 등 고정폭이 필요한 값에는 `JetBrains Mono`를 씁니다.

## 4. 간격 (8pt 그리드)

모든 여백·패딩·갭은 아래 스텝만 사용합니다. `space-0-5`(4px)는 아이콘-텍스트 간격 등 최소 단위에만 예외로 허용합니다.

| 토큰 | 값 | 대표 용도 |
| --- | --- | --- |
| `space-0-5` | 4px | 아이콘-라벨 간격 |
| `space-1` | 8px | 입력창 내부 세로 패딩 |
| `space-1-5` | 12px | 버튼 내부 패딩(세로) |
| `space-2` | 16px | 카드 내부 패딩, 폼 필드 간 간격 |
| `space-3` | 24px | 섹션 내부 블록 간 간격 |
| `space-4` | 32px | 섹션 간 간격 |
| `space-5` | 40px | 카드 그룹 간 간격 |
| `space-6` | 48px | 페이지 상하 여백(모바일) |
| `space-8` | 64px | 페이지 상하 여백(데스크톱) |

Tailwind에서는 기본 스케일(4px 배수)을 그대로 쓰되 **짝수 단계만** 사용합니다: `p-2`(8px), `p-4`(16px), `p-6`(24px), `p-8`(32px), `gap-4`, `gap-6` 등. `p-3`, `p-5`, `gap-3`처럼 8pt 그리드를 벗어나는 홀수 단계는 쓰지 않습니다.

## 5. 컴포넌트 상태 스펙

### 5.1 버튼

| 변형 | 상태 | 배경 | 텍스트 | 보더 | 그림자 |
| --- | --- | --- | --- | --- | --- |
| Primary | Default | `primary-600` | `neutral-0` | 없음 | `shadow-e1` |
| Primary | Hover | `primary-700` | `neutral-0` | 없음 | `shadow-e2` |
| Primary | Active | `primary-800` | `neutral-0` | 없음 | 없음(눌림 표현: `scale-[0.98]`) |
| Primary | Focus-visible | `primary-600` | `neutral-0` | 없음 | `shadow-focus` (2px 링) |
| Primary | Disabled | `neutral-200` | `neutral-400` | 없음 | 없음 |
| Secondary | Default | `neutral-0` | `primary-700` | 1px `neutral-300` | `shadow-e1` |
| Secondary | Hover | `primary-50` | `primary-700` | 1px `primary-300` | `shadow-e1` |
| Secondary | Active | `primary-100` | `primary-800` | 1px `primary-400` | 없음 |
| Ghost | Default | 투명 | `neutral-700` | 없음 | 없음 |
| Ghost | Hover | `neutral-100` | `neutral-900` | 없음 | 없음 |
| Ghost | Active | `neutral-200` | `neutral-900` | 없음 | 없음 |
| Danger | Default | `danger-600` | `neutral-0` | 없음 | `shadow-e1` |
| Danger | Hover | `danger-700` | `neutral-0` | 없음 | `shadow-e2` |
| Danger | Active | `#931f34` | `neutral-0` | 없음 | 없음 |

크기: `sm` 32px(`px-3 text-caption`), `md` 40px(`px-4 text-label`, 기본값), `lg` 48px(`px-6 text-body-lg`, 모바일 주 행동 버튼).

### 5.2 입력창(Input / Select / Textarea)

| 상태 | 보더 | 배경 | 텍스트/설명 |
| --- | --- | --- | --- |
| Default | 1px `neutral-300` | `neutral-0` | placeholder는 `neutral-400` |
| Hover | 1px `neutral-400` | `neutral-0` | — |
| Focus | 1px `primary-500` + `shadow-focus` | `neutral-0` | 커서 진입 시 |
| Filled | 1px `neutral-300` | `neutral-0` | 값이 있는 상태, 보더는 Default와 동일 |
| Error | 1px `danger-600` + `shadow-focus-danger` | `danger-50` | 하단에 `caption` 크기 에러 메시지(`danger-600`) |
| Disabled | 1px `neutral-200` | `neutral-100` | 텍스트 `neutral-400` |

### 5.3 카드

| 상태 | 보더 | 배경 | 그림자 |
| --- | --- | --- | --- |
| Default | 1px `neutral-200` | `neutral-0` | `shadow-e1` |
| Hover(선택 가능한 카드) | 1px `primary-200` | `neutral-0` | `shadow-e2` |
| Active/Selected | 2px `primary-500` | `primary-50` | `shadow-e2` |
| Rejected(정책 위반 결과) | 1px `danger-600` | `danger-50` | `shadow-e1` |

## 6. React + Tailwind 컴포넌트

기본 프리미티브는 [`components/`](./components)에 있습니다.

```tsx
// components/Button.tsx
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "transition-colors duration-150 ease-out disabled:cursor-not-allowed " +
  "focus-visible:outline-none";

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-primary-600 text-white shadow-e1 hover:bg-primary-700 hover:shadow-e2 " +
    "active:bg-primary-800 active:scale-[0.98] focus-visible:shadow-focus " +
    "disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none",
  secondary:
    "bg-white text-primary-700 border border-neutral-300 shadow-e1 " +
    "hover:bg-primary-50 hover:border-primary-300 active:bg-primary-100 " +
    "active:border-primary-400 disabled:text-neutral-400 disabled:border-neutral-200",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 " +
    "active:bg-neutral-200 disabled:text-neutral-400",
  danger:
    "bg-danger-600 text-white shadow-e1 hover:bg-danger-700 hover:shadow-e2 " +
    "active:bg-[#931f34] active:scale-[0.98] disabled:bg-neutral-200 disabled:text-neutral-400",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ variant = "primary", size = "md", className = "", ...props }, ref) => (
  <button
    ref={ref}
    className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    {...props}
  />
));
Button.displayName = "Button";
```

```tsx
// components/Input.tsx
import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { error?: string; label?: string }
>(({ error, label, className = "", id, ...props }, ref) => (
  <div className="flex flex-col gap-1">
    {label && (
      <label htmlFor={id} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
    )}
    <input
      ref={ref}
      id={id}
      className={
        "h-10 rounded-md border bg-white px-3 text-sm text-neutral-900 " +
        "placeholder:text-neutral-400 transition-colors duration-150 " +
        "focus-visible:outline-none focus-visible:border-primary-500 " +
        "focus-visible:shadow-focus disabled:bg-neutral-100 disabled:text-neutral-400 " +
        (error
          ? "border-danger-600 bg-danger-50 focus-visible:shadow-focus-danger "
          : "border-neutral-300 hover:border-neutral-400 ") +
        className
      }
      {...props}
    />
    {error && <p className="text-xs text-danger-600">{error}</p>}
  </div>
));
Input.displayName = "Input";
```

```tsx
// components/Card.tsx
import type { HTMLAttributes } from "react";

type CardState = "default" | "selected" | "rejected";

export function Card({
  state = "default",
  interactive = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { state?: CardState; interactive?: boolean }) {
  const stateClass =
    state === "selected"
      ? "border-2 border-primary-500 bg-primary-50 shadow-e2"
      : state === "rejected"
        ? "border border-danger-600 bg-danger-50 shadow-e1"
        : "border border-neutral-200 bg-white shadow-e1";
  const hoverClass = interactive && state === "default"
    ? "hover:border-primary-200 hover:shadow-e2 cursor-pointer"
    : "";
  return (
    <div
      className={`rounded-lg p-6 transition-shadow duration-150 ${stateClass} ${hoverClass} ${className}`}
      {...props}
    />
  );
}
```

이 프리미티브는 [`../src/features`](../src/features)의 6개 화면(PlanningPage, PlanningForm, ClarificationPanel, PolicyViewer, SimulationPanel, FinalApproval)에서 그대로 재사용합니다. 화면별 구현과 상태 흐름은 [`../README.md`](../README.md)에 있습니다.
