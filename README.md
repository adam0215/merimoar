# Merimoar

Merimoar is a work-in-progress case management system for long-running,
email-driven customer service. It combines a shared inbox with flexible cases,
contacts, and organization-specific entities to flexibly model the businesses operations and its ontology.

Built with TanStack Start, React, Convex, WorkOS, Resend, Tailwind CSS, and
shadcn/ui.

Resend accounts are connected through
[WorkOS Pipes](docs/resend-pipes.md).

Email threads use Gemini embeddings and Convex vector search for
[semantic case suggestions](docs/semantic-case-suggestions.md).

The first portable agent runtime and its local worker setup are documented in
[docs/agent-runtime.md](docs/agent-runtime.md).

## Workspace

The repository is a Bun workspace with one shared lockfile. Dependencies use
Bun's default isolated workspace layout and are installed with `bun install`
from the repository root:

- `packages/web` — the TanStack Start application
- `packages/convex` — Convex functions and the generated client API
- `packages/agent` — runtime-independent agent primitives

Use `#/*` for imports within a package. Import across package boundaries by
package name, for example `@merimoar/convex/api`.
