# Agent runtime

This is the first vertical slice of Merimoar's agent runtime. A member can
delegate a case, a TanStack server subscriber observes queued work in Convex,
and the portable `@merimoar/agent` package invokes `ToolLoopAgent`.

## Runtime boundary

`invokeAgentRun` is caller-independent. It receives a claimed run, a model, and
an `AgentRuntimeAdapter`. The TanStack server currently supplies a Convex
adapter and an OpenAI model, but neither choice leaks into tool execution logic.
The server keeps one outbound Convex client and subscribes to the oldest queued
run ID. A snapshot starts a single-flight claim drain through `invokeAgentRun`.
Claiming is serialized, while already claimed invocations run with bounded
parallelism (four by default, configurable with `AGENT_RUN_CONCURRENCY` from 1
to 32). Each invocation also has a total deadline (ten minutes by default,
configurable with `AGENT_RUN_EXECUTION_TIMEOUT_MS`) that aborts the provider
stream and stops lease renewal. Each run is still atomically claimed before
execution. Multiple server processes may observe the same ID and safely compete
through that claim mutation. No inbound tunnel or periodic queue polling is
involved.

Subscriber shutdown uses a typed infrastructure abort. It stops provider work
and lease renewal, then atomically relinquishes each claim back to Convex.
Relinquishment keeps task ownership and does not consume the bounded
lease-failure budget. Provider deadlines and execution failures remain terminal
error paths.

If a claim mutation itself fails transiently, the subscriber retries that known
drain request with bounded exponential backoff. A successful claim or empty
drain returns it to subscription-only discovery; the recovery timer is never
used to discover new jobs.

The optional local TUI binds a fixed mock business context when the agent is
created. It exercises the same prompt and tools without using production
persistence.

## Durable model

- `agentTasks` stores the long-lived delegation, its durable ownership lock,
  request provenance, selected `agentKey`, terminal result, or cancellation
  reason.
- `agentTurns` stores each new member/system input and its sequence within a
  task.
- `agentRuns` stores each short execution and its bounded claim token and lease.
- `agentItems` is one ordered transcript stream for messages, tools, approvals,
  activities, and errors.

Claim data is part of `agentRuns` because claiming is an execution state, not a
second durable concept. Activities are item variants because they share the
same ordering and retention needs as the rest of a turn; a separate activities
table would duplicate that intent.

The root task repeats its anchor case's organization only to provide a direct,
bounded organization read partition. Child records do not repeat organization,
owner, agent, task, or case identifiers: their scope derives through
`item -> turn -> task -> anchor case`, and the agent derives from the task. The
`runId` on execution-authored items is the other intentional repeated relation:
a turn may eventually have multiple attempts, and the field makes execution
audit attribution unambiguous without copying organization or ownership data.

Every claim and lease renewal increments the run's `leaseGeneration` and
schedules an idempotent Convex watchdog for that generation. If the current
lease expires before status selection, the watchdog changes the run back to
`queued`, which produces a real subscription update. If the status was already
selected durably, the watchdog finalizes it directly rather than letting a
later infrastructure failure overwrite the agent's result. A renewed, replaced,
cancelled, or completed run makes an older watchdog a no-op. Three pre-status
lease losses terminalize the task instead of allowing an indefinitely hanging
or crashing provider to recycle forever.

Waiting and approval states keep `ownershipReleasedAt` null. Completion,
inability to continue, system failure, cancellation, or explicit human takeover
release it and end all remaining queued or claimed runs for the task. Terminal
outcomes remain on the task and are not copied into case history.
`agentTasks` keeps only the small derived lists of currently active run and
approval IDs, so resolution and terminal cleanup are bounded by active work
rather than historical turns.
While ownership is active, ordinary member writes to the case and its
notes or relations fail closed. Explicit takeover is the only member operation
that breaks the lock. Agent write tools independently require the current task
to own the target case.

Activities are structured high-level intention updates (`title` and optional
`detail`), not an automatic echo of every tool call. Each update is a new
ordered, auditable item; current activity can be derived from the latest item
without duplicating task or run state. Text streams are coalesced to roughly
four-second persistence intervals during ordinary generation, then flushed
before tools, approvals, activities, status changes, and finalization.

Member input follows the current run atomically. Input for a queued run is an
ordinary member message on its existing turn. Input for a running run is a
`member_message_steer` on that same turn and run; the runtime reads new steering
between model steps and appends it as user input without starting a parallel
turn. Waiting, completed, unable-to-continue, and failed tasks resume through a
new member turn and queued run. A released task must reacquire case ownership
before that continuation is created.

Inbound email follows the same run boundary for the task that owns its linked
case. The first message resumes a waiting task. Messages received before the
run starts join that turn, while messages received during execution are batched
into one short steering message before the next model step. Steering never
interrupts an active tool call. The run records the latest delivered steering
sequence; if email arrives after the agent has selected its durable status,
finalization creates one catch-up run for the undelivered batch.

Retrying a failed task is distinct from sending a message. Retry preserves the
failed turn and its delivered history, moves any undelivered inbound-email
batch to the replacement run, then queues that run for the same turn without
adding member input. It still reacquires case ownership atomically before the
new run is created.

Approval answers use one typed batch mutation. Partial batches leave the task in
`waiting_for_approval`. The mutation creates exactly one continuation only when
no pending approval remains. Approvals and denials are both durable decisions;
a mixed batch resumes the agent once so it can follow approved actions and adapt
to denied ones. The source run must also have finished before continuation, so
an answer to an early streamed request cannot hide later requests. Tool approval
responses are replayed together in the final AI SDK tool message only for their
assigned continuation run. Completion or failure of that continuation consumes
its assigned decisions while preserving any new pending approval it created, so
later continuations cannot replay an approved effect or an old denial. Human
takeover denies every pending approval, records the takeover reason once on the
task's cancellation record, and rejects late answers.

Email approvals also have a system-owned `invalidated` resolution. A new
inbound message on the proposed thread invalidates pending requests from the
`case.emailReceived` domain-event handler. The handler scans waiting tasks for
the thread's organization, so a relation moved to another case still finds the
original approval. When no active case relation exists, `email.messageReceived`
invokes the same agent-domain function as a fallback. Disabling email sending
uses that same bounded invalidation engine. An approval created by an
already-running agent after the disable batch finishes is born invalidated by
the transactional active-state check at approval creation. The stored cause is
typed data, while the model-facing and UI explanations are derived in code.
Invalidation is replayed through the existing AI SDK approval response as
`approved: false`, so it creates no parallel approval protocol.

Mutating builtins use `(runId, toolCallId)` as their durable idempotency
identity. Their business effect and completed tool item are committed in the
same Convex mutation, so a lease retry after a process crash returns the
committed result without repeating a case creation, case update, or relation
addition.

Built-ins have an organization-level effective active flag. Defaults live in
the portable built-in catalog, sparse organization overrides live in Convex,
and the runtime loads only active definitions for a run. Email sending defaults
off and is the first exposed toggle. A disabled definition is retained only
when the current continuation must replay an already-approved call, allowing
the execute mutation to return the disabled error as a normal tool result. That
mutation rechecks the flag, the task's ownership, and the thread's active
anchor-case relation atomically before reusing the ordinary outbound email
queue. Existing queued sends are not cancelled when the tool is disabled.

`update_task_status` uses that same tool item as its durable ledger. The complete
normalized status payload and the run's pointer to its winning item are
committed atomically during tool execution. A run can therefore select exactly
one status even when same-step tools execute concurrently. If the worker dies
before stream finalization, the reclaimed run finalizes from that ledger without
another model call or a second status item.

## Security and scoping

The server subscriber and Convex deployment share `AGENT_RUNTIME_SECRET`, which
must be at least 32 characters and must never use a `VITE_*` name. The
subscription query and every runtime/tool call require that secret; calls for a
claimed run additionally require its current claim token. Tool execution
derives organization scope from the claimed run's anchor case and rejects
foreign IDs; the model never supplies an organization ID.

`agentTasks.organizationId` deliberately duplicates the verified anchor case's
organization as the root partition for bounded workspace and pending-approval
queries. Task creation derives it server-side, every full task replacement
preserves it, and readers reject a task whose anchor case belongs to a different
organization. Turns, runs, and items remain normalized through the task.

Claim-authorized reads use non-cached Convex mutations so every call rechecks
the run's time-bounded lease. A cached query could otherwise remain authorized
after expiry until a database row changes. The subscription query is separate:
it only signals queued work and does not accept a run claim.

Transcript turns and their items are paginated through separate mutations so
no single Convex transaction reads the complete history. The runtime host
follows every page and reconstructs all turns and items in index order without
context budgeting, summarization, or compaction.

Tool inputs and outputs are stored as exact JSON and replayed unchanged. The
runtime does not maintain a second diagnostic copy and applies no transcript
turn, item, or byte cap and never truncates an accepted tool output. Activities
and error audit items are not model context. Tool and run failures retain their
exact message in the canonical database record. Provider and runtime failures
are redacted only at subscriber and Nitro observability boundaries.

`send_email` accepts at most 50,000 body characters and rejects blank input.
The original tool input remains canonical; the outbound queue trims only
leading and trailing body whitespace immediately before persistence and send.
The custom request helper currently returns only parsed JSON response values,
not response headers, so no header filtering layer is needed in the model path.
It stops reading and rejects a custom-tool HTTP response once its body exceeds
64 KiB; an oversized response therefore never becomes a persisted tool output.

## Agent task schema rollout

`agentTasks` and its required `organizationId` partition are introduced together
on `main`, so a deployment upgrading from `main` has no task rows to migrate and
can build the organization indexes directly. A development deployment that ran
an earlier version of this branch may already contain tasks without the field.
That deployment must use widen-backfill-narrow: temporarily make the field
optional while new writes populate it, then run
`migrations:backfillAgentTaskOrganizationIds` followed by
`migrations:validateAgentTaskOrganizationIds`. Only after both migrations
report success may the required schema be deployed. Convex schema validation
will correctly reject the required field if that backfill is skipped. Codegen
and deployment dry runs also require a configured `CONVEX_DEPLOYMENT`.

## Local setup

Set the following in the TanStack server environment and the Convex deployment:

```dotenv
VITE_CONVEX_URL=https://your-deployment.convex.cloud
AGENT_RUNTIME_SECRET=a-random-secret-of-at-least-32-characters
AGENT_RUN_CONCURRENCY=4
AGENT_RUN_EXECUTION_TIMEOUT_MS=600000
OPENAI_API_KEY=your-development-key
```

If the Convex URL, runtime secret, or OpenAI key is absent—or the runtime secret
is shorter than 32 characters—the server subscriber stays disabled. The
concurrency and timeout settings use the defaults shown above when omitted.
Automated tests use fakes and never call a model or email provider.

## Deliberately deferred

This runtime slice does not add automatic email-triggered delegation, a durable
domain-event queue, inbound webhook invocation, user-configurable hooks,
agent-version CRUD, a custom HTTP integration, or production-scale scheduling.
Email search is a bounded organization-scoped scan suitable for the first
slice; a dedicated search index can replace it behind the same tool boundary
when needed.
