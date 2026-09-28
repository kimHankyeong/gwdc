---
name: franchise-procurement
description: Design system for a Korean franchise procurement, HQ approval, and transaction record application.
---

# Franchise Procurement

Build a restrained financial operations surface for franchise headquarters and branch staff. The supplied brief establishes the context; the project does not claim to represent an existing consumer brand.

## Foundations

- Import tokens from `tokens/colors_and_type.css`; do not duplicate hex values in app components.
- Use IBM Plex Sans KR for Korean interface copy and IBM Plex Mono for amounts, IDs, and hashes. Fonts ship as local npm assets.
- Use ink blue for navigation and primary actions, warm grey for page ground, paper white for data surfaces, and muted bronze for approval. Green means completed, amber means pending, and red means blocked or stopped.
- Keep money and IDs aligned with tabular numerals. Display all values with Korean number formatting and show `원` or `DKRW` explicitly.
- Use case headers and fine rules. Keep radius small and shadows minimal. Prefer tables and timelines over decorative cards.

## Interaction

- Keep HQ policy approval and branch purchase execution on separate role views.
- Confirm irreversible demo actions in place and show a persistent pending/confirmed state.
- A denied purchase stays visible with its rejection reason. Never imply a simulated payment has a chain transaction hash.
- Support keyboard focus, visible focus rings, 44px minimum mobile controls, and reduced-motion settings.

## Copy

- Write short Korean task labels in sentence case.
- Name the actor in audit messages: 본사 승인, 가맹점 요청, 시스템 검증.
- Pair every amount with its currency; identify simulated balances and sample data at their point of use.
- Avoid celebratory copy, unverifiable energy claims, emoji, and model-authorship claims for rule-based demo results.
