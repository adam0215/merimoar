# Agent MVP backend specification

Status: normative specification for the first backend vertical slice.

This document defines what must be true before the first Merimoar agent backend
is ready to commit. It intentionally separates the durable product model from
the temporary runtime hosting choice.

The companion implementation notes in `docs/agent-runtime.md` may explain how
the current code works, but this specification is the source of truth for
expected behavior.

## 1. Product objective

The first iteration must let an authenticated organization member delegate a
case to Merimoar's agent and let that agent solve as much of the task as it can
end-to-end.

The system is not a copilot and chat is not the primary primitive. Human
participation is required only when:

- the agent explicitly needs a decision or approval;
- a configured tool requires approval;
- the agent cannot continue safely;
- the runtime fails; or
- a member explicitly takes the case back.

Agent work must be:

- observable through high-level activity and an inspectable ordered transcript;
- auditable through durable provenance, tool, approval, status, and terminal
  records;
- resumable across waits without keeping an execution process alive;
- isolated to the requesting organization; and
- safe under retries, concurrent deliveries, lease loss, and member takeover.

## 2. Scope

### Required now

- Manual delegation from an existing case.
- A portable agent package built on AI SDK `ToolLoopAgent`.
- A caller-independent invocation primitive.
- A standalone Node worker that accepts signed Convex push deliveries.
- Convex persistence for tasks, turns, runs, transcript items, approvals, and
  case ownership.
- Built-in Merimoar tools.
- Task-level and tool-level approval primitives.
- Member messages that resume idle tasks or steer an in-flight run.
- Inbound email that resumes or steers the task already owning its linked case.
- A local terminal UI using the same agent definition and tools.
- A minimal case/email read model describing active agent ownership.

### Explicitly deferred

- Automatic email delegation and autocapture rules.
- User-configurable hooks or domain-event subscriptions.
- Agent configuration/version CRUD.
- User-configurable integrations and tools.
- A Custom Integration HTTP wrapper.
- MCP exposure of the tools.
- Production-scale scheduling and dedicated email search indexing.

Deferred features must be able to reuse the same invocation, persistence, and
tool boundaries. They must not require redefining task semantics.

## 3. Domain language

### Agent

An agent is a long-lived, versioned configuration representing a colleague. It
contains an instruction, tool set, policy, model metadata, and an `agentKey`.
It is not an execution and is not created once per case.

For the MVP:

- the manifest lives in TypeScript;
- `agentKey` is stored on every task for documentation and audit;
- the key identifies the supported runtime definition;
- there is no database-backed version management; and
- unsupported keys fail closed without invoking a model.

### Task

A task is the long-lived delegation/thread. It may span days and several
executions. It anchors initially to one case but is not itself equivalent to
the case or the case status.

### Turn

A turn is one new member, system, domain-event, or future agent input within a
task. It has a stable sequence and may create one or more execution attempts.

### Run

A run is a short-lived model/tool execution for one turn. Claims, leases,
attempts, usage, and execution failure belong to the run.

No process needs to remain alive while a task is waiting.

### Item

Items form the ordered, durable transcript within a turn. Supported item
families are:

- member and system messages;
- same-turn member steering messages;
- coalesced agent text;
- tool lifecycle records;
- approvals and their resolutions;
- high-level activities; and
- sanitized errors.

### Activity

An activity is a high-level statement of the agent's current intention. It is
not an echo of every tool call. Activities belong in the ordered item stream,
not in a separate table.

## 4. Durable model and normalization

The canonical tables are:

- `agentTasks`;
- `agentTurns`;
- `agentRuns`; and
- `agentItems`.

The following invariants are required:

1. Claim state is stored on `agentRuns`; there is no separate claims table.
2. A task owns the anchor case while `ownershipReleasedAt` is `null`.
3. At most one task may retain ownership of a case.
4. `waiting` and `waiting_for_approval` retain ownership.
5. `completed`, `unable_to_continue`, `failed`, and `cancelled` release
   ownership and have no active runs or approvals.
6. `agentTasks.organizationId` is a deliberate read partition for bounded
   workspace and pending-approval queries. It must equal the anchor case's
   organization. Turns, runs, and items do not duplicate organization, case,
   member-owner, agent, or task data when it can be derived through
   `item -> turn -> task -> case`.
7. `runId` on run-authored items is allowed because it disambiguates attempts
   within one turn.
8. Active run and approval ID arrays are bounded operational indexes, not
   historical storage. Historical records remain in child tables.
9. Request provenance uses the shared vocabulary `requestedAt`, `requestedBy`,
   and optional `requestedByMemberId`.
10. Member provenance is accepted only for an active member in the anchor
    case's organization.
11. Domain-event provenance uses a searchable normalized
    `domainEvent:<eventName>` string. System and agent requests use the same
    namespaced convention.
12. All IDs use table-specific Convex ID types at database boundaries.
13. Every invocation derives the exact anchor case ID through
    `run -> turn -> task`; the runtime supplies that identity to the model
    without duplicating it on turns, runs, or items. A request that refers only
    to "this case" must therefore still target the delegated case.

Schema and validators must encode state invariants where practical. Runtime
checks must cover relational facts the type system cannot prove, especially
cross-task or cross-organization IDs supplied by persisted data or a model.

## 5. Task state machine

The durable task states are:

- `active`;
- `waiting`;
- `waiting_for_approval`;
- `completed`;
- `unable_to_continue`;
- `failed`; and
- `cancelled`.

### Agent-selected states

The internal `update_task_status` tool is the authoritative agent mechanism for
ending a run in one of these states:

- `completed` with a non-empty `result`;
- `waiting` with a non-empty `reason`;
- `waiting_for_approval` with a non-empty request; or
- `unable_to_continue` with a non-empty `result`.

The tool must accept only fields meaningful to the selected state. For example,
`waiting` must not accept or require a result.

The agent must select exactly one status per successful run. Concurrent
same-step status calls must have one deterministic winner. The selected status
must be durable before stream finalization so a reclaimed run can finish
without another model call.

`update_task_status` is the only tool in its final model step and runs only
after every business tool and activity update has finished. Once a run has a
durable selected status, that run is frozen against new business tools,
activity, agent text, or approval requests. Only lifecycle completion,
finalization, and an idempotent replay of the same selected status remain
allowed.

A provider, stream, deadline, or adapter-response error observed after the
status commit must preserve and finalize the selected task status. It must not
replace that durable choice with a failed task merely because the caller did
not observe the commit response.

### System-selected states

- Runtime/provider/infrastructure exhaustion may set `failed`.
- Explicit member takeover sets `cancelled`.
- Neither state is available to the model as an ordinary status choice.

### Terminal task record

Every terminal task remains discoverable through its anchor-case relationship
and agent history. Its outcome is stored once on the task, not copied into the
case event timeline.

- `completed` records the agent's result and rationale on the task.
- `unable_to_continue` records the handoff explanation on the task.
- `failed` records a safe, human-readable failure on the task.
- `cancelled` records the takeover reason on the task.

The complete transcript stays on the task. Terminalization must not create a
duplicate free-text case event.

## 6. Ownership and case safety

While a task retains ownership:

- ordinary member mutations that change the case, its notes, relationships, or
  linked email state must fail closed;
- reads remain available;
- agent mutations require the current task to own the target case;
- the task remains owner while waiting; and
- only explicit takeover or terminalization releases ownership.

Takeover must atomically:

- deny every pending approval and store the takeover reason once on the task's
  cancellation record;
- cancel every queued or running run for the task;
- release ownership;
- terminalize the task as `cancelled`; and
- prevent late approval answers or run completions from reviving it.

## 7. Invocation and worker boundary

`invokeAgentRun` or its equivalent must be independent of Convex, Nitro, and the
model provider. A host supplies:

- the claimed run identity;
- the language model;
- durable transcript and lifecycle operations; and
- organization-scoped business capabilities.

The first host is a standalone Nitro/Node worker. Convex delivers an HMAC-signed
request containing an exact run ID and lease generation.

The worker must:

- reject unsigned, altered, malformed, oversized, or expired deliveries before
  claiming;
- atomically claim the exact delivered run and lease generation before
  execution;
- tolerate duplicate, delayed, and concurrent deliveries;
- acknowledge accepted deliveries before the complete model invocation ends;
- let the serverless platform scale independent invocations without a
  process-local concurrency limit;
- use a total execution deadline and abort provider work on expiry;
- renew a time-bounded lease while running;
- rely on durable lease recovery when a worker terminates unexpectedly; and
- retain retry and delivery state in Convex rather than process memory.

## 8. Claims, leases, retries, and idempotency

- Claim tokens are secret, unguessable execution credentials.
- Claim-authorized operations revalidate the current run, claim token, task,
  organization, and unexpired lease.
- Claim-authorized reads must not rely on a cached authorization result that
  can outlive the lease.
- Every renewal advances a lease generation and schedules an idempotent
  watchdog for that generation.
- Stale watchdogs are no-ops.
- An expired run with a durable selected status finalizes that status instead
  of spending the lease-loss budget or returning to the model.
- Expired current leases without a selected status requeue the run.
- Lease-loss retries are bounded; repeated loss terminalizes the task rather
  than creating an infinite retry loop.
- Provider deadlines and execution failures are distinct from abrupt worker
  loss, which is recovered by lease expiry.
- Mutating built-ins use `(runId, toolCallId)` as their idempotency identity.
- A business mutation and its completed tool record commit atomically.
- Retried or reclaimed execution returns the committed result without repeating
  the business effect.
- Run failure and finalization re-read durable selected-status state; an
  in-memory flag is never the authority for whether the task already chose its
  outcome.

## 9. Transcript and streaming

- Transcript order is stable and derived from turn and item sequences.
- Agent text is streamed internally but persisted in coalesced chunks.
- Ordinary text persistence is throttled to roughly three to five seconds.
- Pending text is flushed before tool cards, approvals, activities, status
  changes, errors, and finalization.
- The database must not receive one write per provider token delta.
- Tool inputs and outputs are persisted as their exact JSON representation.
  They are never silently truncated, summarized, or redacted.
- Model context includes every model-relevant transcript item. Activities and
  error audit items remain durable but are not sent to the model.
- Runtime credentials and authorization headers stay outside model-facing tool
  schemas and results. Canonical failure messages remain exact; provider
  failures are redacted only at observability boundaries.
- A member message sent while the current run is `running` is persisted as a
  `member_message_steer` on that run's turn and becomes model-visible before
  the next model step. It does not create another turn or run.
- A member message sent before a queued run starts is persisted as an ordinary
  `member_message` on that turn. A message sent while a task is `waiting`,
  `completed`, `unable_to_continue`, or `failed` creates the next member turn
  and queued run. A terminal task reacquires case ownership atomically; the
  continuation is rejected if another task already owns the case.
- Inbound email on a linked case resumes its waiting owner. Email arriving for
  a queued run joins that turn; email arriving during execution is batched into
  one short steering message before the next model step. If the run already
  selected its durable status, undelivered email creates one catch-up run after
  finalization instead of being lost.
- Retrying `failed` creates a new queued run on the failed turn without
  creating a turn or member item. The retry preserves delivered transcript
  history, reassigns any undelivered inbound-email batch to the new run, and
  must reacquire case ownership atomically.

## 10. Approvals

The model supports two approval paths:

1. AI SDK tool approval for a tool configured with `needsApproval`.
2. Explicit task approval through `waiting_for_approval`.

Approval requirements:

- pending decisions are durable transcript items;
- `waiting_for_approval` is distinct from passive `waiting`;
- member answers are organization-scoped and batched from 1 to 20;
- partial batches leave the task blocked;
- one continuation run is created only after all active approvals are resolved
  and the source run has finished;
- approved and denied decisions are both replayed to the continuation;
- system-invalidated email decisions are replayed as declined approvals with a
  cause-derived reason;
- decisions are assigned to exactly one continuation run;
- consumed decisions are never replayed again;
- new approvals created by a continuation remain independently pending; and
- takeover rejects late answers and denies unresolved approvals.

The email built-in uses AI SDK tool approval for every proposed send. Human
approval and denial continue to use the generic approval path; system
invalidation is a third durable resolution, not a second approval mechanism.

## 11. Agent package and built-in tools

The package name is `@merimoar/agent`. It must not import TanStack or Convex.

The agent is built with AI SDK `ToolLoopAgent`. Model creation belongs to the
host so providers can be changed without rewriting the agent.

System prompts live as Markdown source and are imported as strings by the
bundler; runtime code must not repeatedly read the filesystem.

The manifest documents the supported `agentKey`, description, and default model
metadata. The selected key is stored on the task.

The built-in folder name is exactly `builtins`. Each built-in owns its AI SDK
definition in an `ai-sdk.ts` file and delegates business behavior through the
portable runtime context so the underlying capability can later be reused by an
MCP adapter.

Required built-ins:

- `global_search`, including all, cases, all entities, and one entity-type
  filter; unfiltered results may include contacts;
- `inspect_entity`, including configured field definitions and values;
- `inspect_contact`;
- `read_case`;
- `create_case`;
- `update_case`, which may change case fields but cannot write free-form case
  events; description and status changes create deterministic audit events in
  the backend;
- `add_case_relation`, which idempotently relates a verified contact, entity,
  case, or email thread to a case through the normalized relation tables;
- `search_emails`, including relevant organization mail outside the anchor
  case;
- `read_email_thread`;
- `send_email`, which always requires approval, accepts at most 50,000 body
  characters, may reply only in a thread with an active relation to the anchor
  case, and queues a whitespace-trimmed body through the same outbound pipeline
  as a member-authored reply without changing the canonical tool input;
- `update_activity`; and
- `update_task_status`.

All capability reads and writes derive organization scope from the claimed
task's verified anchor case. The root task's organization partition supports
member-facing reads; neither the member nor the model supplies it.

Every built-in has an effective organization-level active flag whose default
is defined in the portable catalog. Only email sending is user-configurable in
this version, and it defaults off. Inactive tools are omitted from the runtime
tool map except when a continuation must replay an already-approved call. The
email execute mutation repeats the active check immediately before queueing, so
that replay becomes a failed tool result if the toggle changed; disabling the
tool invalidates pending email approvals but does not cancel sends already
accepted by the outbound queue.

The agent searches before relating records. It uses `global_search` for
contacts, entities, and cases, then inspects or reads each candidate before
calling `add_case_relation`. Email candidates come from `search_emails` and are
verified with `read_email_thread`. It adds every independently relevant record,
but never treats a fuzzy name or keyword match as sufficient evidence. Existing
active relations are returned idempotently. An email thread already linked to a
different case is rejected rather than moved by the agent.

## 12. Active ownership read model

Case detail and a linked email thread's active case return the same nullable
`activeAgentTask` projection.

It is derived, not stored as a case flag:

```ts
type ActiveAgentTask =
  | {
      taskId: Id<"agentTasks">;
      agentKey: string;
      status: "active";
      runStatus: "queued" | "running" | null;
      activity: { title: string; detail?: string } | null;
    }
  | {
      taskId: Id<"agentTasks">;
      agentKey: string;
      status: "waiting";
      reason: string;
    }
  | {
      taskId: Id<"agentTasks">;
      agentKey: string;
      status: "waiting_for_approval";
      pendingApprovalCount: number;
    }
  | null;
```

Rules:

- terminal or released tasks return `null`;
- current activity is the latest activity for the exact current run;
- approval count includes only currently pending active approvals;
- the case and email readers share one canonical resolver;
- the projection contains no transcript, requester, timestamps, display names,
  or preformatted UI copy; and
- full task history is loaded separately by `taskId`.

## 13. Authentication and runtime secrets

- Member mutations derive identity through existing authenticated actor helpers.
- Runtime functions are internal or require `AGENT_RUNTIME_SECRET`.
- The runtime secret is at least 32 characters and never uses a `VITE_*` name.
- Claimed-run calls additionally require the current claim token.
- Runtime/tool lookups fail closed for foreign task, turn, run, item, case,
  contact, entity, email, approval, or member IDs.
- Public functions expose only the minimum surface needed by authenticated
  members.
- Missing or invalid worker configuration fails push ingress closed without
  weakening backend authorization.

## 14. Local terminal UI

The TUI uses the same manifest, prompt, `ToolLoopAgent`, and built-in
definitions. It may supply a fixed in-memory development context.

The TUI is for manual debugging and may call the configured model. Automated
verification must never call a model provider, an email provider, or another
cost-bearing external API.

## 15. Commit-readiness quality bar

The backend is ready to commit only when all of the following are true:

1. The implementation satisfies every required invariant above.
2. No duplicate table or stored field represents state derivable through an
   existing relation without a documented performance, cost, or security
   reason.
3. Runtime, persistence, and host responsibilities have clear package
   boundaries.
4. No source file has grown past 1,000 lines without a compelling structural
   reason; oversized orchestration is decomposed into cohesive modules.
5. There are no one-caller wrappers, duplicated validators, scattered status
   switches, broad casts, or defensive runtime checks that merely reproduce
   TypeScript's guarantees.
6. Relational and authorization checks remain explicit where TypeScript cannot
   prove persisted cross-record relationships.
7. All public and internal Convex functions have argument and return validators.
8. Queries are bounded and use indexes appropriately.
9. Related state transitions are atomic and adversarial concurrency paths are
   tested.
10. Generated files, environment examples, documentation, workspace
    dependencies, and local startup behavior are consistent.
11. Focused positive and negative/adversarial tests cover:
    - delegation and duplicate ownership;
    - provenance and organization isolation;
    - duplicate claim delivery, renewal, expiry, worker loss, and retry limits;
    - transcript ordering and coalescing;
    - idempotent mutating tools;
    - one-winner terminal status;
    - passive waiting and member resume;
    - explicit and tool approvals, partial batches, replay, and takeover;
    - every terminal state and its case-history trace;
    - active ownership projections for case and email readers;
    - corrupt or cross-linked persisted IDs; and
    - exact transcript persistence and boundary-only provider-error redaction.
12. The smallest relevant `bun run check`, package typechecks, focused tests,
    schema/code generation validation, and `git diff --check` all pass.
