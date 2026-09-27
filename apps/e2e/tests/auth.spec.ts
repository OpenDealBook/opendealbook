import { expect, test } from '@playwright/test';

import { newCredentials, signIn, signUp } from './fixtures/auth';

test.describe('authentication', () => {
  test('signs up a new user and lands in /home', async ({ page }) => {
    await signUp(page);

    await expect(page).toHaveURL(/\/home(\/|$)/);
  });

  test('signs an existing user back in', async ({ page, context }) => {
    const user = newCredentials();

    await signUp(page, user);

    await context.clearCookies();

    await signIn(page, user);
  });
});
