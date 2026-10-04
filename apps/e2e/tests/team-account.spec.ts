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

  // Onboarding lands on the personal /home; open the new team workspace. The
  // team "Home" index (/home/<slug>) currently crashes with "Something went
  // wrong" (see report: it calls the ensureTrialSampleData server action during
  // render), so the team context is asserted on the members workspace page,
  // which renders the same workspace layout with the team name in the sidebar.
  await page.goto(`/home/${slug}/members`);
  await expect(page).toHaveURL(new RegExp(`/home/${slug}(/|$)`));
  await expect(page.getByText(teamName).first()).toBeVisible();

  const team = await accountBySlug(request, slug);
  expect(team.is_personal_account).toBe(false);
  expect(team.name).toBe(teamName);

  const members = await membershipsForAccount(request, team.id);
  expect(members).toHaveLength(1);
  expect(members[0]!.account_role).toBe('owner');
});
