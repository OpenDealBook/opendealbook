import { completeTeamOnboarding, db, expect, test } from './fixtures';

test('fresh signup onboards as a team and lands in the team workspace', async ({
  page,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  await auth.signUp(page);

  const teamName = `Harbor Capital ${Date.now()}`;
  const slug = await completeTeamOnboarding(page, teamName);

  await expect(page).toHaveURL(new RegExp(`/home/${slug}(/|$)`));
  await expect(page.getByText(teamName).first()).toBeVisible();
  await expect(page.getByText('Something went wrong')).toHaveCount(0);

  const teams = await db.rows<{
    id: string;
    name: string;
    is_personal_account: boolean;
  }>('accounts', `slug=eq.${slug}&select=id,name,is_personal_account`);
  expect(teams.length).toBe(1);
  const team = teams[0]!;
  expect(team.is_personal_account).toBe(false);
  expect(team.name).toBe(teamName);

  const members = await db.rows<{ account_role: string }>(
    'accounts_memberships',
    `account_id=eq.${team.id}&select=user_id,account_role`,
  );
  expect(members).toHaveLength(1);
  expect(members[0]!.account_role).toBe('owner');
});
