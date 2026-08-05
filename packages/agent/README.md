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

## Custom tool run snapshots

Each run pins its executable custom tool definitions. Tool items retain the
selected runtime name and input, but not the endpoint, schema, approval policy,
or configuration hash required to replay an approval after the workspace tool
changes. Display names are deliberately excluded so activity can resolve the
current name while approval and lease continuation retain the approved runtime
definition.

## Local TUI

The TUI uses the real prompt, agent definition, and built-in tools with a fixed
in-memory development context:

```sh
bun run --cwd packages/agent tui
```

Set `OPENAI_API_KEY` in `.env.local` first. The command calls the
configured model and is intentionally not part of automated verification.
