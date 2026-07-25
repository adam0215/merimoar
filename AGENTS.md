# AGENTS.md

## This is a new project

This is a new project that has no users and no requirements for backwards compatibility. Therefore prioritize sweeping changes and code judo moves if these improve code quality, long term maintainability and extensibility.

This also means you don't have to write regression tests. Instead focus on writing good correct tests that test both real world positive and negative/adversarial scenarios.

## Task Completion Requirements

- Run verifications using the `bun run check / check:write` and `bun run test` commands. Keep local verification focused on the files and packages changed. Run the smallest relevant test set; do not run the full workspace test suite as a routine completion step.
- Backend changes must include and run focused tests for the changed behavior.
- Frontend changes usually don't need full test coverage. Only write frontend tests when asked.
- Run targeted formatting, lint, and type checks for the affected scope when available.
