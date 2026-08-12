# AGENTS.md

Instructions below should be able to be overridden by the user.

## This is a new project

This is a new project that has no users and no requirements for backwards compatibility. Therefore prioritize sweeping changes and code judo moves if these improve code quality, long term maintainability and extensibility.

This also means you don't have to write regression tests. Instead focus on writing good correct tests that test both real world positive and negative/adversarial scenarios.

## Project vocabulary

### Core domain

- **Case**: A long-lived business or customer matter. The central object of the system.
- **Entity type**: An organization-defined category such as Property, Contract, or Invoice with typed data fields. The idea is that the organization creates a database of domain entities specific to their business, helping them model it correctly.
- **Entity**: A concrete instance of an entity type with an identifier, display name, and actual data in the data fields.

### Agent runtime

- **Task**: A long-lived delegation to an agent, anchored to one case. It may contain multiple turns. Think of it as a "chat"/"thread".
- **Turn**: One conversational exchange within a task. It begins with input from a member, system, or domain event and contains the agent's response work as ordered items.
- **Steer**: Input (for example a message from the user correcting the agent) added while a run is executing. It joins the current turn and creates neither a new turn nor a new run.
- **Run**: One invocation of the agent runtime for a turn. It loads the task's relevant transcript and runs the model/tool loop. A run may contain multiple model-provider requests, tool calls, and transcript items. Retries or continuations may create additional runs for the same turn.
- **Item**: One ordered transcript record, such as a message, tool call, approval, activity, or error.

## Project principles

- Robustness and maintainability before laziness. Sweeping changes are preferred if they improve long term implementation-ROI and leverage.
- Reuse functionality and derive data before implementing something new. If something can be derived or reused cleanly without unreasonable costs that is preferred.
- Solve for the current vertical and let complexity and needs reveal themselves with time. Be prepared, but not paranoid.
- Fight scope creep.

## Code principles

- Channel 'yagni' and measure twice, cut once. Code should be elegant and fight for the smallest model that makes the expected behavior unsurprising.
- Function names should always signal the intent of the function.

## Use and trust Typescript and the compiler

Trust Typescript and the compiler. Don't write a bunch of extra code to double check the compiler or data types. Only double check data in situations where the compiler cannot possibly infer the correct data type. Make use of the type system instead of fighting against it or designing in parallel to it.

## UI/UX, styling and design

Always refer to instructions in the DESIGN.md when implementing UI. Then use existing UI and styles as a reference above that.

## When modeling databases

Make sure to take normalization and deduplication into account when modelling data and especially databases. Data should not be duplicated or denormalized if there is no good reason for it, like increased performance, cost reduction or security. Make sure to follow standard database practices to a reasonable degree. Always double check your data model for deduplication opportunities, like if you could derive a piece of data from a join or alike instead of duplicating the data onto another table or if you could derive it later in code from the data already in the data model. In this project for example the organization and owner of a piece of data could usually be derived a step or two higher in the data tree. Also check for duplicated intentions. If you have two tables and they share similar intentions, maybe they should be one? This is not law and should be approached pragmatically.

## Task Completion Requirements

- Run verifications using the `bun run check / check:write` and `bun run test` commands. Keep local verification focused on the files and packages changed. Run the smallest relevant test set; do not run the full workspace test suite as a routine completion step.
- Backend changes must include and run focused tests for the changed behavior.
- Frontend changes usually don't need full test coverage. Only write frontend tests when asked.
- Run targeted formatting, lint, and type checks for the affected scope when available.
- When asked to commit, write messages in the format of the current commit history, if nothing else is specified.

# Convex

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`packages/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

- When doing schema changes, always make sure schema validation succeeds and that there are no mismatches between current rows and the schema. Do this by migrating existing data over to the new schema when needed. Never delete data.
