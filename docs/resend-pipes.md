# Resend through WorkOS Pipes

Merimoar uses a custom WorkOS Pipes provider for Resend OAuth. WorkOS owns the
authorization flow, token storage, and refresh lifecycle. Convex only requests a
fresh access token when it needs to call Resend.

## WorkOS provider

Create a custom provider in WorkOS Pipes with these values:

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

Use custom credentials for the integration. Copy the WorkOS redirect URI from
the provider setup, then pre-register a confidential remote OAuth client with
Resend using:

- the WorkOS redirect URI
- authorization code and refresh token grants
- `client_secret_basic`
- the `full_access` scope

Store the returned Resend client ID and one-time client secret in the WorkOS
provider configuration. Do not add them to Merimoar's environment variables.

## WorkOS webhook subscriptions

The WorkOS webhook endpoint must subscribe to all three Pipes connected-account
events:

- `pipes.connected_account.connected`
- `pipes.connected_account.disconnected`
- `pipes.connected_account.reauthorization_needed`

Without these subscriptions, Merimoar cannot suspend or restore the Resend
integration when its grant changes.

## Runtime flow

1. The organization creates one or more inboxes. Each inbox only has a name,
   email address, and lifecycle state; it does not belong to a provider.
2. A user connects Resend from the email integration settings.
3. The WorkOS connected-account event creates one Resend integration and
   provisions one `email.received` webhook for that service connection.
4. Resend delivers events to
   `/webhooks/email/resend/{emailIntegrationId}`.
5. Convex verifies the integration signing secret and passes the recipients to
   the organization's email router.
6. The router normalizes the addresses, selects an active inbox in the same
   organization, and queues the message for that inbox.
7. The worker asks Pipes for a fresh access token and retrieves the received
   message from Resend.

If Pipes reports that the installation is missing or needs reauthorization, the
integration is marked accordingly and signed deliveries are acknowledged
without being routed. Its webhook ID and signing secret are retained so a
reconnected account can resume without creating duplicates.

If an external webhook is created but cannot be attached to its integration,
Convex records a durable cleanup task. Cleanup retries with exponential backoff
until Resend confirms deletion. Removing an inbox never changes an integration
or webhook.

## Data model

- `emailInboxes` contains provider-independent routing destinations.
- `emailIntegrations` contains one external service connection per provider and
  organization, including its webhook lifecycle.
- `emailIntegrationSyncEvents` deduplicates provider lifecycle events.
- `emailIntegrationWebhookCleanupTasks` owns durable cleanup of external
  webhooks.
- Threads, messages, and routed ingest events reference a destination through
  `inboxId`. Messages and ingest events reference their source through the
  required `integrationId`.
- `emailThreadExternalReferences` maps an integration-scoped external thread ID
  to an inbox thread. A thread can therefore receive messages from more than
  one integration without pretending that the thread itself belongs to a
  provider.

## Required Convex environment

The integration uses the existing `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and
optional `WORKOS_API_HOSTNAME`. `CONVEX_SITE_URL` is provided automatically by
Convex and is used to construct webhook endpoints.

The legacy `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET` variables are not used.
