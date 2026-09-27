import { expect, test } from '@playwright/test';

import { signUp } from './fixtures/auth';

test.describe('personal account settings', () => {
  test('updates the display name', async ({ page }) => {
    await signUp(page);

    await page.goto('/home/settings');

    const nameField = page.getByLabel('Name');
    await expect(nameField).toBeVisible();

    const displayName = `Playwright ${Date.now()}`;
    await nameField.fill(displayName);

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Update failed')).toHaveCount(0);
    await expect(nameField).toHaveValue(displayName);
  });
});
