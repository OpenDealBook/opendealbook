import {
  completeTeamOnboarding,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

const team = newCredentials();

test('the team home lists a close deadline under Today', async ({ page, auth }) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const reason = `The seller retires on the 30th ${stamp}`;
  const mustCloseBy = new Date(Date.now() + 5 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, `Today Team ${stamp}`);
  const { dealPath } = await createDeal(page, teamSlug, `Today Deal ${stamp}`);

  await page.goto(`${dealPath}/lenders`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByLabel('Must close by').fill(mustCloseBy);
  await page.getByLabel('Why that date').fill(reason);
  await page.getByRole('button', { name: 'Save deadline' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel('Must close by')).toHaveValue(mustCloseBy, {
      timeout: 3000,
    });
  }).toPass({ timeout: 30 * 1000 });

  await page.goto(`/home/${teamSlug}`);
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Deadlines in the next 14 days' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: `Must close by: ${reason}` })).toBeVisible();
});
