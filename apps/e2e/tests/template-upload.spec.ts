import { randomBytes } from 'node:crypto';

import type { Page } from '@playwright/test';

import { completeTeamOnboarding, expect, newCredentials, test } from './fixtures';
import type { Auth } from './fixtures/auth';
import { templateDocument } from '@odb/templates/test-support/docx-template.ts';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MEBIBYTE = 1024 * 1024;

async function newTemplatePage(page: Page, auth: Auth) {
  const stamp = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;

  await auth.signUp(page, newCredentials());
  const teamSlug = await completeTeamOnboarding(page, `Template Upload ${stamp}`);
  await page.goto(`/home/${teamSlug}/settings/templates/new`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);

  return { teamSlug, stamp };
}

test('a template over 1 MB uploads, shows its fields and saves', async ({ page, auth }) => {
  test.setTimeout(180 * 1000);

  const { teamSlug, stamp } = await newTemplatePage(page, auth);
  const buffer = templateDocument([
    'Offer for {{purchase_price}} closing on {{target_close_date}}.',
    randomBytes(1_200_000).toString('base64'),
  ]);

  expect(buffer.length).toBeGreaterThan(MEBIBYTE);

  await page.getByLabel('Name').fill(`Large ${stamp}`);
  await page.getByLabel('Document (.docx)').setInputFiles({ name: 'large.docx', mimeType: DOCX, buffer });
  await expect(page.getByRole('heading', { name: 'Fields (2)' })).toBeVisible({ timeout: 60 * 1000 });
  await page.getByRole('button', { name: 'Save template' }).click();
  await page.waitForURL(`/home/${teamSlug}/settings/templates`);
  await expect(page.getByText(`Large ${stamp}`)).toBeVisible();
});

test('a template over 25 MB is refused with a readable reason', async ({ page, auth }) => {
  test.setTimeout(120 * 1000);

  await newTemplatePage(page, auth);
  await page.getByLabel('Document (.docx)').setInputFiles({
    name: 'huge.docx',
    mimeType: DOCX,
    buffer: Buffer.alloc(25 * MEBIBYTE + 1),
  });

  await expect(page.getByText('This template is over 25 MB')).toBeVisible();
});
