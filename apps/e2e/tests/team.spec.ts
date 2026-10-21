import { completeTeamOnboarding, db, expect, test } from './fixtures';

test.describe('team accounts', () => {
  test('creates a team and opens its members and invite form', async ({
    page,
    auth,
  }) => {
    await auth.signUp(page);
    await completeTeamOnboarding(page, `First Crew ${Date.now()}`);

    await page.goto('/home/create-team');

    const teamName = `Crew ${Date.now()}`;
    await page.getByLabel('Team name').fill(teamName);

    await page.getByRole('button', { name: 'Create team' }).click();
    const { slug } = await db.waitForRow<{ slug: string }>(
      'accounts',
      `name=eq.${encodeURIComponent(teamName)}&select=slug`,
    );

    await page.goto(`/home/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/home/${slug}(/|$)`));

    await page.goto(`/home/${slug}/members`);

    await expect(
      page.getByRole('button', { name: 'Send invitations' }),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
  });
});
