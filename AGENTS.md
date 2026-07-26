# AGENTS.md

## This is a new project

This is a new project that has no users and no requirements for backwards compatibility. Therefore prioritize sweeping changes and code judo moves if these improve code quality, long term maintainability and extensibility.

This also means you don't have to write regression tests. Instead focus on writing good correct tests that test both real world positive and negative/adversarial scenarios.

## Task Completion Requirements

- Run verifications using the `bun run check / check:write` and `bun run test` commands. Keep local verification focused on the files and packages changed. Run the smallest relevant test set; do not run the full workspace test suite as a routine completion step.
- Backend changes must include and run focused tests for the changed behavior.
- Frontend changes usually don't need full test coverage. Only write frontend tests when asked.
- Run targeted formatting, lint, and type checks for the affected scope when available.
- When asked to commit, write messages in the format of the current commit history, if nothing else is specified.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
