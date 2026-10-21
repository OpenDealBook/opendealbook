import { completeTeamOnboarding, expect, test } from './fixtures';

test.describe('personal account settings', () => {
  test('updates the display name', async ({ page, auth }) => {
    await auth.signUp(page);
    await completeTeamOnboarding(page, `Account Team ${Date.now()}`);

    await page.goto('/home/settings');

    const nameField = page.getByLabel('Name');
    await expect(nameField).toBeVisible();

    const displayName = `Playwright ${Date.now()}`;
    await nameField.fill(displayName);

    await page
      .locator('form')
      .filter({ has: nameField })
      .getByRole('button', { name: 'Save' })
      .click();

    await expect(page.getByText('Update failed')).toHaveCount(0);
    await expect(nameField).toHaveValue(displayName);
  });
});
