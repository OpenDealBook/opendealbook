import { expect, test } from '@playwright/test';

import {
  accountBySlug,
  completeTeamOnboarding,
  membershipsForAccount,
  signUp,
} from './fixtures/team';

test('fresh signup onboards as a team and lands in the team workspace', async ({
  page,
  request,
}) => {
  test.setTimeout(240 * 1000);

  await signUp(page);

  const teamName = `Harbor Capital ${Date.now()}`;
  const slug = await completeTeamOnboarding(page, teamName);

  // Onboarding lands on the personal /home; open the team "Home" index
  // (/home/<slug>), which seeds trial sample deals during render. Hitting the
  // index directly exercises that seed path and asserts it renders the team
  // name instead of the "Something went wrong" error boundary.
  await page.goto(`/home/${slug}`);
  await expect(page).toHaveURL(new RegExp(`/home/${slug}(/|$)`));
  await expect(page.getByText(teamName).first()).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  const team = await accountBySlug(request, slug);
  expect(team.is_personal_account).toBe(false);
  expect(team.name).toBe(teamName);

  const members = await membershipsForAccount(request, team.id);
  expect(members).toHaveLength(1);
  expect(members[0]!.account_role).toBe('owner');
});
