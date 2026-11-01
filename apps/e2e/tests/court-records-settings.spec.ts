import { completeTeamOnboarding, expect, test } from './fixtures';

test('the state court and lien records card is marked Beta with its unverified-broker note', async ({
  page,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(
    page,
    `Broker Team ${Date.now()}`,
  );
  await page.goto(`/home/${teamSlug}/settings`);

  const cardTitled = (title: string) =>
    page
      .locator('[data-slot=card]')
      .filter({ has: page.getByRole('heading', { name: title }) });
  const courtRecords = cardTitled('State court and lien records');
  await expect(courtRecords).toHaveCount(1);
  await expect(
    courtRecords.getByRole('heading', { name: 'State court and lien records' }),
  ).toHaveText('State court and lien recordsBeta');
  await expect(
    courtRecords.getByText(
      'Broker results are not yet verified against live Baselayer and Middesk accounts.',
    ),
  ).toBeVisible();

  const federalCourts = cardTitled('Federal courts');
  await expect(federalCourts.getByRole('heading')).toHaveText('Federal courts');
  await expect(federalCourts.getByText(/not yet verified/)).toHaveCount(0);
});
