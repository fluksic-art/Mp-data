# Feature Specification: [FEATURE_NAME]

> Constitution version: 2.0.0
> Target phase: [1|2|3|4]

## Summary

[1-2 sentence description of the feature]

## Motivation

[Why this feature is needed. Link to lead gen business model.]

## User Stories

- As [ROLE], I want [ACTION] so that [BENEFIT].

## Functional Requirements

### [REQ_ID] — [Requirement Name]

[Description of the requirement]

**Acceptance criteria**:

- [ ] [Criterion]

## Non-Functional Requirements

### Performance

[Latency, throughput, resource constraints]

### Observability (P6)

- Pino structured logging with: `source_id`, `crawl_run_id`,
  `duration_ms`, `status`
- LLM token tracking: `input_tokens`, `output_tokens`, `cost_usd`
- Sentry error capture for all failures

### Idempotency (P4)

- Natural key: `source_id + source_listing_id`
- ON CONFLICT DO UPDATE semantics on all upserts

### Lead Capture (P8)

- [ ] Does this feature surface listing pages? If yes, WhatsApp CTA
  and contact form MUST be present.

## Constitution Constraints

| Principle | Applies? | How |
| --------- | -------- | --- |
| P1 — Facts Never Touch LLM | [Yes/No] | [Details] |
| P2 — Extractor-Renderer Separation | [Yes/No] | [Details] |
| P3 — YAGNI | [Yes/No] | [Details] |
| P4 — Idempotency | [Yes/No] | [Details] |
| P5 — Token Efficiency | [Yes/No] | [Details] |
| P6 — Observability | [Yes/No] | [Details] |
| P7 — Human Approval | [Yes/No] | [Details] |
| P8 — Lead Funnel | [Yes/No] | [Details] |
| P9 — Simplicity-First | [Yes/No] | [Details] |

## Technology Choices

Per constitution Section 2 (All-TypeScript stack):

- [List applicable stack constraints]
- NO Python in main codebase

## Content Strategy Alignment

- [ ] Programmatic content links to editorial content
- [ ] Editorial content exists before programmatic pages go live
- [ ] URL structure follows convention (Section 5)

## Prohibited Approaches

- [List relevant prohibitions from constitution Section 4]

## Out of Scope

- [Explicitly list what this feature does NOT include]
- [List any phase-gated capabilities that are NOT part of this work]

## Open Questions

- [Questions requiring clarification before implementation]
