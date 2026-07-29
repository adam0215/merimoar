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
