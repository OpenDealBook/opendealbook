import {
  completeInviteeOnboarding,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { addTeamMember } from './fixtures/calc';

test('a manager changes the team time zone and a member sees it read-only', async ({
  page,
  browser,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Zone Team ${Date.now()}`);
  const settings = `/home/${teamSlug}/settings`;

  await page.goto(settings);
  const zone = page.getByLabel('Time zone', { exact: true });
  await expect(zone).toBeEnabled();
  await zone.selectOption('Asia/Tokyo');
  await expect(page.locator('p[role=alert]')).toHaveCount(0);
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel('Time zone', { exact: true })).toHaveValue('Asia/Tokyo', { timeout: 3000 });
  }).toPass({ timeout: 30 * 1000 });

  const member = newCredentials();
  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await auth.signUp(memberPage, member);
  await addTeamMember(teamSlug, await db.userIdByEmail(member.email), 'member');
  await completeInviteeOnboarding(memberPage, teamSlug, 'Mia Member');
  await memberPage.goto(settings);
  await expect(memberPage.getByLabel('Time zone', { exact: true })).toBeDisabled();
  await expect(memberPage.getByLabel('Time zone', { exact: true })).toHaveValue('Asia/Tokyo');
  await context.close();
});
