# `@merimoar/agent`

Portable agent definitions, built-in tool logic, and the execution loop for
Merimoar.

The package has no dependency on TanStack Start or Convex. A host supplies an
`AgentRuntimeAdapter` for persistence and organization-scoped capabilities, and
an `AgentRunSubscriberHost` for observing and atomically claiming queued work.
The subscriber drains work through the caller-independent `invokeAgentRun`
primitive, so a future worker or MCP adapter can use the same invocation
boundary.

Built-in schemas and execution live together in their AI SDK definitions.
`update_task_status` is an internal harness tool, not an integration.
`update_activity` records intentional, high-level progress changes; tool calls
retain their own ordered audit items instead of being duplicated as activities.

## Local TUI

The TUI uses the real prompt, agent definition, and built-in tools with a fixed
in-memory development context:

```sh
bun run --cwd packages/agent tui
```

Set `OPENAI_API_KEY` in `.env.local` first. The command calls the
configured model and is intentionally not part of automated verification.
