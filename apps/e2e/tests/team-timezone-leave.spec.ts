import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import type { Page } from '@playwright/test';

import { completeTeamOnboarding, db, expect, test } from './fixtures';

const run = promisify(execFile);

async function forgetPersonalZone(email: string) {
  await run('docker', [
    'exec',
    process.env.SUPABASE_DB_CONTAINER ??
      `${process.env.COMPOSE_PROJECT_NAME ?? 'opendealbook'}-db-1`,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `update public.accounts set timezone = null where email = '${email}' and is_personal_account`,
  ]);
}

async function teamZone(slug: string) {
  const [team] = await db.rows<{ timezone: string }>(
    'accounts',
    `slug=eq.${slug}&select=timezone`,
  );
  return team!.timezone;
}

async function holdBrowserZoneDetection(page: Page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const body = request.postData() ?? '';
    if (
      request.method() === 'POST' &&
      body.includes('"timezone"') &&
      !body.includes('accountId')
    ) {
      await sleep(3000);
    }
    await route.continue();
  });
}

for (const leave of ['link', 'document'] as const) {
  test(`a team time zone change survives leaving by ${leave} while browser zone detection is slow`, async ({
    page,
    auth,
  }) => {
    test.setTimeout(120 * 1000);

    const { email } = await auth.signUp(page);
    const slug = await completeTeamOnboarding(page, `Leave ${leave} ${Date.now()}`);
    await page.waitForLoadState('networkidle');
    await forgetPersonalZone(email);
    await holdBrowserZoneDetection(page);

    await page.goto(`/home/${slug}/settings`);
    await page.getByLabel('Time zone', { exact: true }).selectOption('Asia/Tokyo');
    await sleep(200);

    if (leave === 'link') {
      await page.locator(`a[href$="/home/${slug}"]`).first().click();
    } else {
      await page.goto(`/home/${slug}`);
    }

    await expect.poll(() => teamZone(slug), { timeout: 10_000 }).toBe('Asia/Tokyo');
  });
}
