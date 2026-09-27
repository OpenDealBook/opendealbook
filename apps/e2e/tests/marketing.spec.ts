import { expect, test } from '@playwright/test';

test.describe('marketing pages', () => {
  test('pricing renders plans', async ({ page }) => {
    await page.goto('/pricing');

    await expect(
      page.getByRole('heading', { name: 'Pricing', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Get started' }).first(),
    ).toBeVisible();
  });

  test('blog renders', async ({ page }) => {
    await page.goto('/blog');

    await expect(
      page.getByRole('heading', { name: 'Blog', level: 1 }),
    ).toBeVisible();
  });
});
