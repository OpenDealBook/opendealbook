import { completeTeamOnboarding, expect, test } from './fixtures';

test('monthly caps persist and a negative cap is not saved', async ({ page, auth }) => {
  test.setTimeout(90 * 1000);

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Caps Team ${Date.now()}`);
  const outreach = `/home/${teamSlug}/outreach`;

  await page.goto(outreach);
  await expect(page.getByRole('heading', { name: 'Monthly caps' })).toBeVisible();
  await expect(page.getByText(/\d+ used this month/).first()).toBeVisible();

  await page.getByLabel('Letters per month').fill('50');
  await page.getByLabel('Paid lookups per month').fill('20');
  await page.getByLabel('AI calls per month').fill('10');
  await page.getByRole('button', { name: 'Save caps' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel('Letters per month')).toHaveValue('50', { timeout: 3000 });
    await expect(page.getByLabel('Paid lookups per month')).toHaveValue('20', { timeout: 3000 });
    await expect(page.getByLabel('AI calls per month')).toHaveValue('10', { timeout: 3000 });
  }).toPass({ timeout: 30 * 1000 });

  await page.getByLabel('AI calls per month').fill('-1');
  await page.getByRole('button', { name: 'Save caps' }).click();
  await page.reload();
  await expect(page.getByLabel('AI calls per month')).toHaveValue('10');
});
