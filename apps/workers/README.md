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

`pnpm run-dev` from the monorepo root runs the web app and this worker together
against the local Docker stack, with Supabase and Mailpit settings for the
current worktree unless those variables are already set. `NOVU_API_KEY` stays
unset because each Novu install mints its own; set it to turn on notifications.
Ctrl+C stops the web app and the worker; Docker keeps running.

To run the worker alone:

```bash
pnpm --filter workers dev
```

`dev` watches and restarts; `start` runs a single process for production.

## Configuration

- `TEMPORAL_ADDRESS`: Temporal server address; defaults to `localhost:7233`.
- Supabase service-role credentials, read by the activities through
  `@odb/supabase/server`: `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`.

The namespace is `default` and the task queue is `opendealbook`.
