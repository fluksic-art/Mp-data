# Implementation Plan: [FEATURE_NAME]

> Generated from spec: [SPEC_FILE]
> Constitution version: 2.0.0

## Constitution Compliance Check

Before implementation, verify against permanent principles:

- [ ] **P1 — Facts Never Touch LLM**: All factual data uses typed
  columns + template rendering. No numeric literals in prompts.
- [ ] **P2 — Extractor-Renderer Separation**: No coupling between
  source UX and clone UX.
- [ ] **P3 — YAGNI**: No speculative features. No phase-gated
  capability built prematurely.
- [ ] **P4 — Idempotency**: All workers use natural key +
  ON CONFLICT DO UPDATE.
- [ ] **P5 — Token Efficiency**: HTML cleaned before LLM. Batch API
  and prompt caching used where applicable.
- [ ] **P6 — Observability**: Pino structured logging, token tracking,
  Sentry integration present.
- [ ] **P7 — Human Approval**: No auto-publish path exists.
- [ ] **P8 — Lead Funnel**: Every listing page has WhatsApp CTA
  and/or contact form.
- [ ] **P9 — Simplicity-First**: Both team members can understand
  and debug every component.

## Phase Gate Check

This feature belongs to Phase [N]. Verify:

- [ ] All Phase [N-1] exit criteria are met
- [ ] No capabilities from Phase [N+1] are being built

## Overview

[Brief description of what this plan implements and why]

## Architecture

[Component diagram, data flow, key decisions]

### Stack Alignment (All-TypeScript)

| Component | Technology | Per constitution? |
| --------- | ---------- | ----------------- |
| [COMPONENT] | [TECH] | Yes/No |

## Implementation Phases

### Step 1 — [NAME]

[Description, deliverables, success criteria]

### Step 2 — [NAME]

[Description, deliverables, success criteria]

## Prohibited Approaches

Per constitution Section 4:

- No Python in main codebase
- No HTML crudo al LLM
- No CMS in phase 1-2
- [Add relevant prohibitions]

## Risks and Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| [RISK] | [IMPACT] | [MITIGATION] |

## Success Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] All permanent principles verified
- [ ] Lead capture mechanism present (if user-facing)
