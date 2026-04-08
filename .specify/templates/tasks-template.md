# Task Breakdown: [FEATURE_NAME]

> Spec: [SPEC_FILE]
> Plan: [PLAN_FILE]
> Constitution version: 2.0.0
> Target phase: [1|2|3|4]

## Task Categories

Tasks are categorized by constitution-driven concerns:

- **core**: Primary feature logic
- **idempotency**: ON CONFLICT handling, natural keys (P4)
- **observability**: Pino logging, Sentry, token tracking (P6)
- **validation**: Fact-check, quality gates (P1, P7)
- **lead-capture**: CTA, forms, leads table (P8)
- **testing**: Unit (Vitest), integration, E2E

## Phase Gate

- [ ] This work belongs to Phase [N]
- [ ] Phase [N-1] exit criteria are met
- [ ] No Phase [N+1] capabilities included

## Tasks

### [PHASE_NAME]

#### Task 1 — [TASK_NAME]

- **Category**: [core|idempotency|observability|validation|lead-capture|testing]
- **Priority**: [P0|P1|P2]
- **Depends on**: [Task N | None]
- **Description**: [What needs to be done]
- **Acceptance criteria**:
  - [ ] [Criterion]
- **Constitution check**:
  - [ ] [Relevant principle verified]

#### Task 2 — [TASK_NAME]

[Same structure]

## Dependency Graph

```text
Task 1 ─► Task 3
Task 2 ─► Task 3
Task 3 ─► Task 4
```

## Completion Checklist

- [ ] All tasks completed
- [ ] All permanent principles verified (P1-P9)
- [ ] All-TypeScript (no Python introduced)
- [ ] Vitest tests passing
- [ ] Observability logging confirmed (P6)
- [ ] Idempotency verified via re-run (P4)
- [ ] Lead capture present on user-facing pages (P8)
- [ ] No phase-gated capability built prematurely (P3)
- [ ] Both team members can understand the code (P9)
