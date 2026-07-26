<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `bunx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# AGENTS.md

## Durable Project Context

### TanStack Intent

TanStack Intent was initialized from the workspace root with:

```bash
npx @tanstack/intent@latest install
npx @tanstack/intent@latest list
```

Before changing a TanStack package concern, load the most specific matching
package-shipped skill. Skills already loaded while establishing this project:

```bash
npx @tanstack/intent@latest load @tanstack/react-start#react-start
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core
npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-routes
npx @tanstack/intent@latest load @tanstack/router-core#router-core/navigation
```

Run `npx @tanstack/intent@latest list` again after dependency upgrades, and
load further skills before working on auth, server functions, middleware,
deployment, AI, or other listed concerns.

### Product Direction

- Product version `0.1` is developed in multiple named steps. Do not invent
  semantic sub-versions such as `0.1.1` or `0.2` for those steps.
- The current step is the Email foundation: receive inbound text email, store
  it, list email threads, and read individual messages and complete threads.
- Cases, outbound email, attachments, AI automation, and configurable domain
  entities are later steps within the broader `0.1` effort.
- All user-facing application copy is English.
- The primary sidebar item is `Email`.
- Settings live at the bottom of the sidebar under `Settings`, with a
  collapsible `Organization` item and an `Email` child for connections.
- Use official shadcn components installed through its CLI. Start with their
  built-in behavior before adding custom replacements or responsive logic.
- The app uses shadcn's neutral color tokens and defaults to light mode. Keep
  stored `dark` and `auto` preferences compatible with a future theme control.

### Chosen Stack and Integrations

- TanStack Start and TanStack Router
- React 19 and TypeScript
- Convex for persistence and reactive data
- Resend as the first inbound email adapter
- WorkOS AuthKit for future application authentication and organization access
- shadcn/ui using the configured `radix-maia` style and Tabler icons
- Tailwind CSS v4
- Nitro as the current Node-compatible server adapter

### Email Data Model

Keep the initial model normalized around these relationships:

```text
organization -> emailConnection -> emailThread -> emailMessage
```

- A thread belongs to exactly one connection.
- A message belongs to exactly one thread.
- If the same correspondence arrives through two connections, it is two email
  threads. A future case may relate them.
- Provider identity is stored once on the connection.
- The initial integration catalog is static application configuration, not
  database data. Resend is the only available integration in the current step.
- Creating a connection is a three-step settings flow: integration, details,
  and review. The browser validates continuously with Valibot; the Convex
  mutation performs independent Zod validation and normalization.
- Resend API credentials remain deployment secrets. A connection stores only
  its provider, display name, receiving address, organization, and status.
- Provider-neutral external thread and message IDs may live on their respective
  records; do not add source tables unless a real many-source requirement
  appears.
- `emailIngestEvents` owns webhook idempotency, raw event provenance, status,
  and its connection reference because it exists before thread resolution.
- Message participants are immutable header observations, not mutable contacts.
  Keep them with the message; link future entities without overwriting history.
- Avoid thread snapshots of subject, sender, recipients, preview, or message
  count. `latestMessageId` plus `lastActivityAt` is the one deliberate read
  projection for indexed thread ordering and must be updated atomically.
- Thread using provider thread ID when available, otherwise RFC `Message-ID`,
  `In-Reply-To`, and `References`. Do not merge by subject alone.

### Environment Variables

Never commit real values. Local/server hosting currently expects:

```text
WORKOS_CLIENT_ID
WORKOS_API_KEY
WORKOS_REDIRECT_URI
WORKOS_COOKIE_PASSWORD
WORKOS_API_HOSTNAME
CONVEX_DEPLOYMENT
VITE_CONVEX_URL
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
```

Convex functions that use environment variables require those variables to be
configured on the relevant Convex deployment as well as locally.

### Deployment Notes

- No production host has been selected.
- The current Nitro output can run on a Node-compatible host.
- A Resend webhook endpoint must be publicly reachable over HTTPS, must verify
  the raw payload signature, and must process duplicate `svix-id` deliveries
  idempotently.
- Resend inbound webhooks contain metadata, not the complete body. Retrieve the
  received email through Resend's Receiving API before normalization.
- WorkOS production redirect URLs and the Convex production deployment must be
  configured independently from development.

### Known Gotchas

- TanStack Start code is isomorphic by default. Keep secrets and provider calls
  behind server-only boundaries.
- `tanstackStart()` must precede the React plugin in Vite configuration.
- `<Scripts />` must remain in the root document body.
- The installed TanStack Start guidance says not to enable
  `verbatimModuleSyntax`; remove the starter's current setting before relying on
  server/client code elimination.
- Use `Link` for clickable navigation rather than imperative `useNavigate`.
- Convex public functions are Internet-accessible. Webhook-only mutations must
  be internal.
- Read `convex/_generated/ai/guidelines.md` before every Convex change.
- Convex queries returning growing collections must be bounded or paginated.

### Next Steps

The Email foundation, Resend ingestion, reader UI, connection onboarding UI,
and focused backend tests are implemented and deployed to the personal Convex
development deployment. The `Merimoar` organization with slug `merimoar`
exists in that deployment.

1. Create the first Resend connection through Organization → Email settings
   using the lowercased receiving address.
2. Configure `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` on the Convex
   development deployment.
3. Point Resend at the Convex HTTP endpoint `/webhooks/resend` and send a fresh
   inbound message through the complete pipeline.
4. Protect the connection mutation by connecting WorkOS identities and
   organization membership to Convex before
   exposing the app beyond trusted internal development.
5. After real email usage validates this foundation, plan the first case model
   as the next step inside product version `0.1`.

## This is a new project

This is a new project that has no users and no requirements for backwards compatibility. Therefore prioritize sweeping changes and code judo moves if these improve code quality, long term maintainability and extensibility.

This also means you don't have to write regression tests. Instead focus on writing good correct tests that test both real world positive and negative/adversarial scenarios.

## Task Completion Requirements

- Run verifications using the `bun run check / check:write` and `bun run test` commands. Keep local verification focused on the files and packages changed. Run the smallest relevant test set; do not run the full workspace test suite as a routine completion step.
- Backend changes must include and run focused tests for the changed behavior.
- Frontend changes usually don't need full test coverage. Only write frontend tests when asked.
- Run targeted formatting, lint, and type checks for the affected scope when available.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
