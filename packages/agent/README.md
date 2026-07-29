# `@merimoar/agent`

Runtime-independent primitives for defining and running Merimoar agents.

This package must not depend on a specific host such as TanStack Start, Convex,
or a future standalone worker. Hosts provide their capabilities through narrow
adapters when the first agent use case is implemented.
