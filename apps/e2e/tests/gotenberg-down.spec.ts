import { execFileSync } from 'node:child_process';

import {
  card,
  completeTeamOnboarding,
  expect,
  newCredentials,
  REDLINE_DOCX,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

const GOTENBERG = `${process.env.COMPOSE_PROJECT_NAME ?? 'opendealbook'}-gotenberg-1`;

test.describe.configure({ mode: 'serial' });

test('a redline uploaded while Gotenberg is down can be retried once it is back', async ({
  page,
  browser,
  auth,
  cleanup,
  counsel,
  contracts,
}) => {
  test.setTimeout(240 * 1000);

  const stamp = Date.now();
  const counselPerson = { email: newCredentials().email, name: `Bea Counsel ${stamp}` };
  const summary = `Markup while down ${stamp}`;

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Down Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Down Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });
  await contracts.seed({
    dealId,
    versions: [{ party: 'buyer', summary: `Draft ${stamp}`, shared: true }],
  });
  await page.goto(`${dealPath}/parties`);
  await counsel.inviteBuyerCounsel(page, counselPerson);
  const counselContext = await browser.newContext();
  const counselPage = await counselContext.newPage();
  await counsel.signIn(counselPage, { email: counselPerson.email, dealId });

  try {
    execFileSync('docker', ['stop', GOTENBERG]);

    await counselPage.goto(`/counsel/${dealId}/contracts`);
    const counselLoi = card(counselPage, 'LOI');
    await counselLoi.getByLabel('Redline (.docx)').setInputFiles(REDLINE_DOCX);
    await counselLoi.getByLabel('What changed (optional)').fill(summary);
    await counselLoi.getByRole('button', { name: 'Upload redline' }).click();
    await expect(counselLoi.getByRole('row').filter({ hasText: summary })).toBeVisible();

    await page.goto(`${dealPath}/documents`);
    const loi = card(page, 'LOI');
    await expect(loi.getByText('PDF conversion failed').first()).toBeVisible({ timeout: 60 * 1000 });
    const section = loi.locator('[data-version-review]').filter({ hasText: 'on version 2' });
    await section.getByRole('button', { name: 'Send for signature' }).click();
    const request = page.getByRole('dialog', { name: 'Send for signature' });
    await request.getByLabel('Signer 1 name').fill('Sig Signer');
    await request.getByLabel('Signer 1 email').fill(newCredentials().email);
    await request.getByRole('button', { name: 'Send for signature' }).click();
    await expect(
      request.getByText(/^Version 2 has no PDF to sign\. Retry the PDF or upload the Word file again\./),
    ).toBeVisible();
    await request.getByRole('button', { name: 'Cancel' }).click();
  } finally {
    execFileSync('docker', ['start', GOTENBERG]);
  }

  await expect(async () => {
    await page.goto(`${dealPath}/documents`);
    await page.getByRole('button', { name: 'Retry PDF' }).first().click({ timeout: 3000 });
    await expect(
      card(page, 'LOI').getByRole('row').filter({ hasText: summary }).getByRole('link', { name: 'PDF' }),
    ).toBeVisible({ timeout: 10 * 1000 });
  }).toPass({ timeout: 90 * 1000 });
  await counselContext.close();
});
