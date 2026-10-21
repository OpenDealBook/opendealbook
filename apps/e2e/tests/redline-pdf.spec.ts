import {
  card,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  REDLINE_DOCX,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

test('a counsel redline gets a PDF and can be sent for signature', async ({
  page,
  browser,
  auth,
  cleanup,
  counsel,
  contracts,
}) => {
  test.setTimeout(180 * 1000);

  const stamp = Date.now();
  const counselPerson = { email: newCredentials().email, name: `Bea Counsel ${stamp}` };
  const signer = { name: `Sig Signer ${stamp}`, email: newCredentials().email };
  const summary = `Counsel markup ${stamp}`;

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Redline Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Redline Deal ${stamp}`);
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

  await counselPage.goto(`/counsel/${dealId}/contracts`);
  const counselLoi = card(counselPage, 'LOI');
  await counselLoi.getByLabel('Redline (.docx)').setInputFiles(REDLINE_DOCX);
  await counselLoi.getByLabel('What changed (optional)').fill(summary);
  await counselLoi.getByRole('button', { name: 'Upload redline' }).click();
  await expect(counselLoi.getByRole('row').filter({ hasText: summary })).toBeVisible();

  await page.goto(`${dealPath}/documents`);
  const redlineRow = card(page, 'LOI').getByRole('row').filter({ hasText: summary });
  await expect(redlineRow.getByRole('link', { name: 'PDF' })).toBeVisible({ timeout: 60 * 1000 });

  const section = card(page, 'LOI')
    .locator('[data-version-review]')
    .filter({ hasText: 'on version 2' });
  await section.getByRole('button', { name: 'Send for signature' }).click();
  const request = page.getByRole('dialog', { name: 'Send for signature' });
  await request.getByLabel('Signer 1 name').fill(signer.name);
  await request.getByLabel('Signer 1 email').fill(signer.email);
  await request.getByRole('button', { name: 'Send for signature' }).click();
  await expect(request).toBeHidden({ timeout: 60 * 1000 });

  await expect
    .poll(
      async () =>
        (
          await db.rows<{ signing_status: string | null }>(
            'contract_version',
            `version=eq.2&signing_status=not.is.null&select=signing_status&contract_id=in.(${(
              await db.rows<{ id: string }>('contract', `deal_id=eq.${dealId}&select=id`)
            )
              .map((row) => row.id)
              .join(',')})`,
          )
        ).length,
      { timeout: 30 * 1000 },
    )
    .toBe(1);
  await counselContext.close();
});
