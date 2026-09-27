# workers

The OpenDealbook Temporal worker. It polls the `opendealbook` task queue on the
local Temporal server, runs the `DealLifecycle` workflow and its stage children,
and executes the audit and notification activities against Supabase.

## Prerequisites

The local Temporal server must be running before the worker starts:

```bash
docker compose --profile core up -d
```

That brings up the Temporal server on `localhost:7233` and the web UI on
`localhost:8233`.

## Run it

From the monorepo root:

```bash
pnpm --filter workers dev
```

`dev` watches and restarts; `start` runs a single process for production.

## Configuration

- `TEMPORAL_ADDRESS`: Temporal server address; defaults to `localhost:7233`.
- Supabase service-role credentials, read by the activities through
  `@tuckin/supabase/server`: `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`.

The namespace is `default` and the task queue is `opendealbook`.
