# Agent worker

Stateless Node host for Merimoar agent runs. Convex delivers a signed push to
`POST /agent/runs/push`; the worker atomically claims that exact run and executes
it through the primitives in `@merimoar/agent`.

Run it locally on port 3001 with:

```sh
bun run --cwd packages/agent-worker dev
```

The worker intentionally exposes no UI, queue subscriber, or process-local
concurrency controls. Nitro supplies the request lifecycle locally and on its
supported serverless presets.
