import { expect, newCredentials, test } from './fixtures';

test.describe('authentication', () => {
  test('signs up a new user and lands in onboarding', async ({
    page,
    auth,
  }) => {
    await auth.signUp(page);

    await expect(page).toHaveURL(/\/onboarding(\/|$)/);
  });

  test('signs an existing user back in', async ({ page, context, auth }) => {
    const user = newCredentials();

    await auth.signUp(page, user);

    await context.clearCookies();

    await auth.signIn(page, user);

    await expect(page).toHaveURL(/\/home(\/|$)/);
  });
});
