# e2e

Playwright end-to-end smoke suite for the Open Deal Book web app.

## What it covers

- `tests/auth.spec.ts`: sign up a fresh faker user at `/auth/sign-up` and land
  in `/home`, then clear cookies and sign the same user back in.
- `tests/account.spec.ts`: from the personal account settings page update the
  display name and confirm the change sticks.
- `tests/team.spec.ts`: create a team at `/home/create-team`, open the team
  workspace at `/home/{slug}`, then open its members page and the invite form.
- `tests/marketing.spec.ts`: `/pricing` shows plans and `/blog` renders.

`tests/fixtures/auth.ts` holds the shared sign-up and sign-in helpers; each run
mints a unique email with `@faker-js/faker`, so the suite does not depend on a
particular seeded account.

## Running locally

These specs run against a locally running web app backed by a local Supabase
stack. They are not hermetic; they exercise real routes and real auth.

1. Start Supabase for the web app (from `apps/web`): `pnpm supabase start`.
2. Start the web app: `pnpm --filter web dev` (serves `http://localhost:3000`).
3. Run the suite: `pnpm --filter e2e test` (or `test:ui` for the runner UI).

Override the target with `PLAYWRIGHT_BASE_URL`. To let Playwright boot the web
app itself, uncomment the `webServer` block in `playwright.config.ts`.

## Seeded accounts

Pre-seeded, already-confirmed users live in `apps/web/supabase/seed.sql`. The
smoke specs create their own users rather than reusing those, but the seed is
the source of truth if a test needs a known confirmed account.
