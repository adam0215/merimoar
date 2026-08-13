# Resend through WorkOS Pipes

Merimoar uses a custom WorkOS Pipes provider for Resend OAuth. WorkOS owns the
authorization flow, access-token storage, and refresh lifecycle. Convex stores
only a projection of connected-account identity, state, and scopes, and asks
WorkOS for a fresh access token immediately before a provider call.

## WorkOS provider

Create a custom WorkOS Pipes provider with these values:

| Field | Value |
| --- | --- |
| Name | `Resend` |
| Slug | `resend` |
| Authorization URL | `https://api.resend.com/oauth/authorize` |
| Token URL | `https://api.resend.com/oauth/token` |
| Refresh token URL | `https://api.resend.com/oauth/token` |
| Scope | `full_access` |
| Scope separator | Space |
| Client secret required | Yes |
| PKCE | Enabled |
| Authenticate via | Basic authorization header |
| Token body content type | `application/x-www-form-urlencoded` |

`full_access` is required because the app reads received email and manages a
Resend webhook. The narrower `emails:send` scope cannot access those APIs.

Use custom credentials for the integration. Pre-register a confidential remote
OAuth client with Resend using the WorkOS redirect URI, authorization code and
refresh token grants, `client_secret_basic`, and the `full_access` scope.

Store the returned Resend client ID and one-time client secret in the WorkOS
provider configuration. Do not add them to Merimoar's environment variables.

## WorkOS webhook subscriptions

The WorkOS webhook endpoint subscribes to the documented Pipes
connected-account events:

- `pipes.connected_account.connected`
- `pipes.connected_account.disconnected`
- `pipes.connected_account.reauthorization_needed`

Events are verified against the unmodified request body. The handler records
and deduplicates every `event.id`, normalizes the payload into a provider-neutral
snapshot, and atomically updates the account and its product binding. Events
with `organization_id: null` are retained as ignored audit events and are never
attached to a local organization.

The installed WorkOS SDK does not currently expose a contracted
`pipes.connected_account.connection_failed` event. Add it only after WorkOS
documents the payload and the installed SDK exposes its event constant; do not
infer durable connection state from an uncontracted failure event.

## Runtime model

`connectedAccounts` is the sole local projection of every organization-scoped
WorkOS Pipes account. Its external account ID is guarded as unique by all
mutation code even though Convex indexes are not unique. A known external
account ID cannot change organization, provider, WorkOS user, or data
integration.

WorkOS keeps two identifiers deliberately separate. The configured data
integration has an environment-specific slug such as `resend` or
`resend-prod`, while connected-account events report the underlying provider
type in `provider_slug` (`custom` for Resend). Event routing therefore resolves
the configured slug to its canonical `data_integration_id` and compares that
ID with the webhook payload. Provider type is never used to fetch tokens or to
decide whether an account is Resend.

`emailIntegrations` is a one-to-one Resend product binding. It contains only the
`connectedAccountId` foreign key and the atomic `resendWebhook` object. Email
inboxes, messages, thread references, ingest events, and cleanup tasks continue
to reference the email integration. The public webhook URL therefore remains:

```text
/webhooks/email/resend/{emailIntegrationId}
```

`connectedAccountSyncEvents` is the provider-neutral WorkOS event dedupe and
audit log. A WorkOS event atomically deduplicates and upserts this projection.
Non-Resend providers stop there; Resend also creates its thin email binding and
schedules webhook reconciliation. Provider calls happen only in actions, never
inside the webhook mutation.

The activation fence checks the integration/account relation, connection
status, WorkOS version, required scopes, and active webhook. One concurrent
creation wins; losers are deleted immediately or queued for durable cleanup.

The old `emailIntegrationSyncEvents` rows remain as an unreferenced archive so
the cutover never deletes staging data. Runtime dedupe and all new writes use
only `connectedAccountSyncEvents`.

Durable cleanup tasks intentionally retain the WorkOS organization, WorkOS
user, and webhook ID that created the external resource. Those immutable
snapshots prevent a later rotation or disconnect from deleting the wrong
webhook.

## Connection state and email readiness

WorkOS connection state and email capability are separate:

- `connected`: WorkOS can mint credentials.
- `needs_reauthorization`: WorkOS requires a new authorization.
- `disconnected`: the installation no longer exists.

Stored scopes are a UI projection. The scopes returned with a freshly minted
token are authoritative at runtime. Missing `full_access` is an email
configuration error and must not change WorkOS connection state.

Readiness is derived as follows:

| Condition | Inbound | Outbound |
| --- | --- | --- |
| Connection is not `connected` | inactive | inactive |
| `full_access` is missing | missing scope | missing scope |
| Scope exists and webhook is missing | provisioning | ready |
| Scope and webhook exist | ready | ready |

Domain verification is handled separately from outbound token readiness.
Every inbound and outbound path resolves
`emailIntegration -> connectedAccount -> organization`; workers then mint a
fresh WorkOS token and validate its scopes before using Resend.

## Staging widen–migrate–narrow cutover

This migration is staging-only. Never add `--prod` to any command. Deploy exact
commit `92ddb53310342d4ba8f74191750fa89b9495736b` for the widened staging
cutover and its complete migration surface. The narrow schema starts at
`d3e6bc643db5ca68df50ccddb127c7836b8d3ab5`; use the reviewed final HEAD from
the implementation handoff, including its later fixes and simplifications, for
the narrow deployment.

### 1. Enter maintenance and deploy the widened cutover

1. Resolve the Convex target and verify it is the intended staging deployment:

   ```sh
   bunx convex env list
   bunx convex data organizations --limit 5
   ```

2. Start the staging maintenance window before deploying any refactor commit.
   Disable staging UI/API actions that create inboxes or send email.
3. In the staging WorkOS and Resend environments, pause delivery to these
   endpoints without deleting the external endpoint/webhook records:
   `POST /workos/webhook` and
   `POST /webhooks/email/resend/{emailIntegrationId}`. If the provider has no
   pause control, make the staging ingress return a retryable response for only
   those routes.
4. Wait until the Convex dashboard shows no running email ingest/outbound
   Workpool items, no running integration actions, and no due webhook
   reconciliation/cleanup scheduled functions. Record the counts and start
   time.
5. Deploy `92ddb53310342d4ba8f74191750fa89b9495736b` to staging. Do not deploy
   the reviewed final narrow HEAD yet.

The repository cannot automate provider/dashboard maintenance safely because
those controls and credentials are outside Convex.

### 2. Preflight the staging data

Run every migration as a dry run immediately before its real phase. A
successful dry run deliberately ends with a `DRY RUN` Convex error after
printing its sample change; no writes are retained.

```sh
bunx convex run migrations:preflightConnectedAccountSplit '{"dryRun":true}'
bunx convex run migrations:preflightConnectedAccountCleanupTasks '{"dryRun":true}'
bunx convex run migrations:runConnectedAccountSplitPreflight
bunx convex run --component migrations lib:getStatus
```

Stop on duplicate external IDs, multiple email integrations for one future
account, organization mismatch, partial webhook fields, incomplete legacy
identity, orphaned cleanup tasks, or an unexpected provider. Never merge or
delete conflicted rows; investigate them before continuing.

### 3. Backfill and reconcile

Run each dependent backfill only after the previous migration status is `done`:

```sh
bunx convex run migrations:backfillConnectedAccountsFromEmailIntegrations '{"dryRun":true}'
bunx convex run migrations:backfillConnectedAccountsFromEmailIntegrations
bunx convex run --component migrations lib:getStatus
bunx convex run migrations:backfillEmailIntegrationResendWebhooks '{"dryRun":true}'
bunx convex run migrations:backfillEmailIntegrationResendWebhooks
bunx convex run --component migrations lib:getStatus
bunx convex run migrations:backfillConnectedAccountSyncEvents '{"dryRun":true}'
bunx convex run migrations:backfillConnectedAccountSyncEvents
bunx convex run --component migrations lib:getStatus
bunx convex run integrations/reconcileActions:reconcileConnectedAccountsWithWorkos '{}'
```

The live reconciliation skips synthetic `seed:` data integrations. Those are
forced to `disconnected` with an empty scope projection. All other accounts are
refetched from WorkOS because the legacy `needs_reauthorization` state did not
distinguish connection failure from missing Resend scope.

Wait for every reconciliation page and scheduled webhook/cleanup action to
settle before validation.

### 4. Validate, remove legacy fields, and narrow

Dry-run all exact validators against the copied and live-reconciled graph, then
run the serial validation phase:

```sh
bunx convex run migrations:validateConnectedAccountSplit '{"dryRun":true}'
bunx convex run migrations:preflightConnectedAccountCleanupTasks '{"dryRun":true,"reset":true}'
bunx convex run migrations:preflightConnectedAccountCleanupTasks '{"reset":true}'
bunx convex run migrations:validateEmailInboxIntegrationReferences '{"dryRun":true}'
bunx convex run migrations:validateEmailThreadIntegrationReferences '{"dryRun":true}'
bunx convex run migrations:validateEmailMessageIntegrationReferences '{"dryRun":true}'
bunx convex run migrations:validateEmailIngestIntegrationReferences '{"dryRun":true}'
bunx convex run migrations:validateConnectedAccountSyncEventBackfill '{"dryRun":true}'
bunx convex run migrations:runConnectedAccountSplitValidation
bunx convex run --component migrations lib:getStatus
```

Export or inspect the staging tables and record:

- equal counts of legacy email integrations, linked Resend connected accounts,
  and thin email integrations
- exactly one account for every external connected-account ID
- exactly one email integration for every Resend connected account
- unchanged organization, WorkOS user, data-integration, and external-account
  values; the reconciled WorkOS version must be at least the legacy version and
  any increase must match the live WorkOS snapshot
- exact equivalence between the three legacy webhook fields and the nested
  webhook object
- no unlinked integration, orphaned email reference/cleanup task, or
  unbackfilled sync event
- no new row with only a legacy representation

Only after that evidence has been reviewed, strip the copied legacy fields and
prove the thin shape in a second exact pass:

```sh
bunx convex run migrations:removeLegacyEmailIntegrationFields '{"dryRun":true}'
bunx convex run migrations:removeLegacyEmailIntegrationFields
bunx convex run --component migrations lib:getStatus
bunx convex run migrations:validateEmailIntegrationLegacyFieldsRemoved '{"dryRun":true}'
bunx convex run migrations:validateEmailIntegrationLegacyFieldsRemoved
bunx convex run migrations:verifyConnectedAccountSplit
bunx convex run --component migrations lib:getStatus
```

`verifyConnectedAccountSplit` must return `complete: true`, every sample array
must be empty, and every migration status must be `done`.

### 5. Narrow and resume

1. Deploy the final narrow commit to the same staging deployment. Convex schema
   validation is the final guard that no legacy-shaped row remains.
2. Resume the two provider webhook routes and email UI/API entry points.
3. Smoke-test one WorkOS connected event (and a duplicate delivery), a
   degradation event, Resend inbound routing, outbound sending, and webhook
   rotation/disconnect cleanup.
4. Confirm the sync event outcome, email message/inbox organization, active
   webhook ID, and completed cleanup task all match the staged test identities.

## Required Convex environment

The integration uses the existing `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and
optional `WORKOS_API_HOSTNAME`. `WORKOS_RESEND_PROVIDER_SLUG` selects the
environment-specific WorkOS data-integration slug and defaults to `resend`;
Production uses `resend-prod`. `CONVEX_SITE_URL` is provided automatically by
Convex and constructs the email webhook endpoint.

The legacy `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` variables are not used.
