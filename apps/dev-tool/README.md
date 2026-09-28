# dev-tool

A tiny local utility that reports the state of your Open Deal Book development
environment. It is for local use only and is never published.

Run it from the monorepo root:

```bash
pnpm --filter dev-tool dev
```

It reads (never prints the values of) `apps/web/.env.local` and reports:

- whether `apps/web/.env.local` exists;
- the local Supabase endpoints (API, Studio, mailbox, database), read from
  `apps/web/supabase/config.toml` with sensible fallbacks;
- a presence-only checklist of the required environment variables;
- the list of `@odb/*` workspace packages.

The script is plain TypeScript run through Node's native type stripping
(`node --experimental-strip-types`), so it needs Node 24+ and no extra
dependencies.
