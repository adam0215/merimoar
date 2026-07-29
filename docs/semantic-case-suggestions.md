# Semantic case suggestions

The link-email-thread dialog suggests cases whose title and description are
semantically similar to the inbound messages in the thread. Suggestions are an
addition to the existing title and reference search, not a replacement for it.

## User experience

Suggestions are generated lazily when the link dialog opens. The dialog shows
three loading placeholders and then up to three case suggestions. Selecting a
suggestion uses the same selection and linking flow as a manual search result.
Hovering or focusing a suggestion opens a compact case preview with its status,
reference, title, description, latest activity, owner, and due date.
Successful suggestion results are cached in a Zustand memory store per email
thread for five minutes. This makes reopening the dialog instant during the
current browser session. Failures are not cached.

Typing in the search field hides the suggestions and uses the existing global
search. If Gemini is unavailable, the dialog shows `Suggestions unavailable`
and manual search remains usable.

The current implementation does not apply a minimum similarity score. It asks
Convex for eight vector hits, hydrates valid cases, and displays the first
three. Add a threshold only after observing real scores and false positives.

## Embedding model

The implementation uses
[`gemini-embedding-001`](https://ai.google.dev/gemini-api/docs/embeddings) with
512 output dimensions.

- Cases use the `RETRIEVAL_DOCUMENT` task type.
- Email threads use the `RETRIEVAL_QUERY` task type.
- Case content consists of the title, a newline, and the description. The title
  is also supplied through Gemini's document-title configuration.
- Reduced Gemini Embedding 1 vectors are L2-normalized before storage or
  search. Gemini Embedding 1 does not normalize dimensions below 3,072
  automatically.

The 512-dimensional size is intentional. Google's published Embedding 1
benchmark changes from 67.99 at 768 dimensions to 67.55 at 512 dimensions,
while each vector becomes one third smaller.

Query embeddings are cached for seven days with Convex Action Cache. The cache
key contains the condensed inbound-message text, so a new message creates a
cache miss. The cache name includes the model and dimensions, which prevents
vectors from an old embedding space from being reused after a configuration
change. Vector search and result hydration are not cached, so case data remains
current.

Model name and dimensions live in
[`convex/case/embeddingModel.ts`](../convex/case/embeddingModel.ts). The schema
imports the same dimension constant, preventing the request and vector index
sizes from drifting apart.

## Thread query input

The query input only contains inbound messages. Outbound replies from Merimoar
members are excluded.

1. Load the latest 100 inbound messages with the
   `by_thread_id_and_direction_and_sent_at` index.
2. Restore chronological order.
3. Trim each body and discard empty bodies.
4. Join the bodies with a newline.
5. Keep the final 6,000 characters.

The message and character limits keep the database read bounded and leave
headroom under Gemini Embedding 1's 2,048-token input limit. Keeping the final
characters favors the most recent part of long threads.

## Seed emails for testing

`seed/acme:seedSuggestionEmails` creates four unread, unlinked threads covering
uneven radiator heat, duplicate payment, an offline temperature sensor, and
evening hot-water problems. Running the seed repeatedly does not create
duplicates and refreshes the seeded subject lines.

```sh
bunx convex run seed/acme:seedSuggestionEmails \
  '{"organizationId":"<organization-id>","confirmation":"seed-suggestion-emails"}'
```

## Data model

Embeddings are stored in the separate `caseEmbeddings` table:

| Field | Purpose |
| --- | --- |
| `caseId` | The case represented by the vector |
| `organizationId` | Tenant filter for vector search |
| `embedding` | The normalized 512-dimensional vector |

The table has:

- a `by_case_id` database index for one embedding per case
- a `by_embedding` vector index filtered by `organizationId`

### Why embeddings are not stored on `cases`

Convex supports putting the embedding field and vector index directly on the
`cases` table. The separate table is a performance and lifecycle choice, not a
technical requirement.

Merimoar frequently returns complete case documents from list, detail, and
option queries. A vector on `cases` would make 512 otherwise unused numbers
travel through those reads and reactive updates. Cases are also updated for
routine activity, while embeddings only change when the title or description
changes.

Keeping embeddings separate:

- keeps operational case reads small
- avoids coupling activity updates to large, low-churn vectors
- represents a temporarily missing or failed embedding without changing the
  core case document
- isolates re-embedding and future model migrations

The tradeoff is an extra lookup when hydrating vector hits.

## Indexing lifecycle

Case embeddings are generated asynchronously because Convex vector search and
Gemini calls run in actions.

- Creating a case schedules `case/embedding:embedCase`.
- Updating a title or description removes the stale embedding and schedules a
  replacement.
- Status, assignment, deadline, and activity-only updates do not re-embed.
- Acme seed cases schedule embeddings when inserted.
- `migrations:scheduleCaseEmbeddingBackfill` schedules missing embeddings for
  existing cases.

Before writing a generated vector, the mutation verifies that the case title
and description still equal the values embedded by the action. An action that
finishes after a concurrent edit therefore cannot restore stale data.

## Retrieval and tenant isolation

`case/embedding:suggestForEmailThread` is a public action. It first calls an
internal query that authenticates the actor, verifies ownership of the email
thread, and builds the query input.

The vector search filters on the authenticated organization ID. Hydration then
checks both the embedding row and case again before returning a hit. Results
from another organization cannot be returned even if an inconsistent row were
present.

Relevant modules:

- [`convex/case/embedding.ts`](../convex/case/embedding.ts): Gemini calls,
  vector search, and public suggestion action
- [`convex/case/embeddingData.ts`](../convex/case/embeddingData.ts): database
  reads, writes, authorization, and hit hydration
- [`convex/case/embeddingModel.ts`](../convex/case/embeddingModel.ts): model
  constants, input construction, truncation, and normalization
- [`src/components/email/email-case-actions.tsx`](../src/components/email/email-case-actions.tsx):
  lazy loading and suggestion UI

## Configuration and deployment

Set `GEMINI_API_KEY` in each Convex deployment that should generate
suggestions. Do not commit the key.

```sh
bunx convex env set GEMINI_API_KEY "$GEMINI_API_KEY"
bunx convex dev --once
```

Backfill existing cases after deploying the table and functions:

```sh
bunx convex run migrations:scheduleCaseEmbeddingBackfill
```

If a previous backfill completed but some asynchronous actions failed, restart
the migration. Existing embeddings are skipped, so only missing rows are
scheduled:

```sh
bunx convex run migrations:scheduleCaseEmbeddingBackfill '{"reset":true}'
```

Inspect failures through Convex logs:

```sh
bunx convex logs --history 100
```

The `caseEmbeddings` table can also be inspected in the Convex dashboard or
with `bunx convex data caseEmbeddings`.

## Changing the model or dimensions

Embedding spaces from different models are not comparable. A model change
requires re-embedding every case before its vectors can be searched with the
new query model.

A dimension change additionally requires updating
`CASE_EMBEDDING_DIMENSIONS`, which also changes the Convex vector index
definition. Create a dedicated reindex migration that schedules every case,
including cases that already have an embedding. `scheduleCaseEmbeddingBackfill`
only fills missing rows and is not a full reindex.

Keep document and query generation on the same model, dimensions, normalization
rules, and retrieval task pair.
