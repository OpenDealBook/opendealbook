# e2e

Playwright end-to-end suite for the Open Deal Book web app. It runs against the
real local stack and reads real email from Mailpit.

## The stack a run needs

The global setup (`tests/global-setup.ts`) checks every service first. If any is
missing, the run fails and lists what to start. It never starts, stops, or
resets a service.

- Supabase from `apps/web` (`pnpm supabase start`), with `enable_confirmations = true`
  applied. The setup reads `/auth/v1/settings` to confirm sign-up waits for email.
- Mailpit, the Supabase mail catcher: API on 54324, SMTP on 54325.
- The compose `core` and `notifications` profiles: Gotenberg (3009), Documenso
  (3005), Novu (3006), Temporal (7233, UI on 8233).
- Temporal workers polling the `opendealbook` task queue.
- `infra/documenso/cert.p12`, which Documenso needs to seal signed documents; signing tests never complete without it. Generate it with the recipe in `infra/documenso/README.md`.

Stripe, Nango, and the LLM are local stand-ins the global setup starts:

- LLM on 4510, an OpenAI-compatible `/v1/chat/completions`.
- Nango on 4511: `/connect/sessions` and `/proxy/*`.
- Stripe on 4512: checkout sessions, portal sessions, subscriptions, and signed
  webhooks sent to `/api/billing/webhook`.

After the checks, the global setup:

1. Starts the stand-ins.
2. Signs in to Novu as a fixed e2e user, registering it on the first run, and
   reads its API key. It points Novu's email integration at Mailpit SMTP.
3. Writes the workers' env to `apps/e2e/.e2e-workers.env` and checks a worker
   polls the task queue. If none does, the run fails and prints the command
   that starts the workers with that env:
   `set -a && . apps/e2e/.e2e-workers.env && set +a && pnpm --filter workers dev`
4. Signs in to Documenso as a fixed e2e user through its UI, signing up on the
   first run. It adds the app's webhook and mints an API token. Set
   `E2E_DOCUMENSO_API_KEY` to reuse a token instead of minting one.
5. Starts the web server on `http://localhost:3000` with the full e2e env and
   `ENABLE_BILLING=true`, then syncs the Novu bridge.

The server writes `ENABLE_BILLING` into the database's shared config row at
boot, and the global teardown sets team billing back on. The server builds into
its own `NEXT_DIST_DIR` under `apps/web/.next`, so a developer's own `next dev`
keeps its dev lock. Port 3000 must be free.
Server output goes to `apps/e2e/.stack-logs/`.

## Writing a test

Import `test` and `expect` from `tests/fixtures`, not from `@playwright/test`.

- `auth.signUp(page, user?)` signs up and confirms through the real
  confirmation email. `auth.signIn(page, user)` and `auth.signOut(page, user)`
  cover the rest.
- `completePersonalOnboarding(page, choices?)` and
  `completeTeamOnboarding(page, teamName, choices?)` run the wizard. `choices`
  takes a `name`, a `dealBox`, and `compPoolOptIn`.
- `lender.invite(roomPage, { email, name? })` invites from a room's People tab.
  `lender.signIn(page, { email, roomId })` opens the invite email's link.
- `db.rows`, `db.insert`, `db.remove`, `db.rpc`, `db.waitForRow`, and
  `db.userIdByEmail` use the service role.
- `waitForMessage({ to, subject? })` returns the newest matching email.
  `firstLink(message, pattern)` returns its first link that matches.
- `standIns.llm`, `standIns.nango`, and `standIns.stripe` set stand-in replies
  and read what the app sent them.

Every user that `auth` or `lender` creates is tracked. Track anything else with
`cleanup.track({ kind: 'storage', bucket, prefix })`. After a passing test the
cleanup deletes storage objects, rate-limit rows, the users' team accounts, and
the users. After a failing test it keeps everything and attaches the list to the
report.

## Running

Stop `pnpm run-dev` first. From the repo root:

```sh
pnpm run-e2e                  # the whole suite
pnpm run-e2e auth.spec --headed   # extra args go to `playwright test`
```

`pnpm run-e2e` refuses to start while port 3000 is in use. It brings up
the compose profiles and Supabase, and mints `apps/e2e/.e2e-workers.env` with a
global-setup-only run when the file is missing. It then starts a worker with
that env and waits for it to poll `opendealbook`. Last, it runs Playwright, stops
the worker, and exits with Playwright's code.

`tests/fixtures.spec.ts` smoke-tests each fixture against the running stack.

## Speed and fix loops

- The web server runs a production build (`next build`, then `next start`) into
  `apps/web/.next/e2e-main`. The build is skipped when
  nothing under `apps/web`, `packages` or `tests/stack` is newer than the last
  build. `E2E_SKIP_BUILD=1` reuses the last build regardless; `E2E_DEV=1` falls
  back to `next dev` for debugging. Build output is in `.stack-logs/*-build.log`.
- Workers default to 3 locally (full-deal holds one of them for its whole run) (1 on CI); override with `E2E_WORKERS=n`. Every
  spec makes its own users and emails and filters Mailpit and the Gmail
  stand-in by recipient, so specs do not share state.
- `full-deal` runs as its own Playwright project (`--project=full-deal`), in
  parallel with the rest. Run everything but it with `--project=chromium`.
- Fix loops: `pnpm run-e2e --last-failed` reruns only what failed last time;
  `pnpm run-e2e --only-changed` runs the specs affected by uncommitted changes.
