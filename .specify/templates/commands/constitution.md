# Command: constitution

Updates the project constitution at `.specify/memory/constitution.md`.

## Usage

Invoke via `/speckit.constitution` to:
- Add, modify, or remove governing principles
- Update technology stack constraints
- Amend coding conventions or quality gates
- Adjust governance procedures

## Propagation

After any constitution change, the following templates MUST be
reviewed for consistency:

- `.specify/templates/plan-template.md` — Constitution Check section
- `.specify/templates/spec-template.md` — Constraints table
- `.specify/templates/tasks-template.md` — Task categories

## Versioning

Constitution uses semantic versioning (MAJOR.MINOR.PATCH):
- **MAJOR**: Principle removal or incompatible redefinition
- **MINOR**: New principle or material expansion
- **PATCH**: Wording, typos, non-semantic changes
