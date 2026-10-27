import type { Page } from '@playwright/test';

import { completeTeamOnboarding, expect, test } from './fixtures';
import { seedFinishedSearch } from './fixtures/background';
import { createDeal } from './fixtures/deal';
import { teamIdOf } from './fixtures/workflows';

async function expectRedAmberGreen(page: Page, businessName: string) {
  await expect(
    page.getByText('One open federal lawsuit needs review before closing.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Red (1)',
    'Amber (1)',
    'Green (1)',
  ]);
  await expect(
    page.getByText(`Harbour Supply v. ${businessName}`),
  ).toBeVisible();
  await expect(page.getByText('Dana Rowen on SDN list')).toBeVisible();
  await expect(
    page.getByText(`5-star review of ${businessName}`),
  ).toBeVisible();
}

test('a deal manager reads the background report and runs the search again', async ({
  page,
  auth,
}) => {
  test.setTimeout(180 * 1000);

  await auth.signUp(page);
  const stamp = Date.now();
  const teamSlug = await completeTeamOnboarding(
    page,
    `Background Team ${stamp}`,
  );
  const businessName = `Rowan Fixture Plumbing ${stamp}`;
  const { dealId, dealPath } = await createDeal(page, teamSlug, businessName);
  await seedFinishedSearch({
    accountId: await teamIdOf(teamSlug),
    dealId,
    businessName,
  });

  await page.getByRole('link', { name: 'Diligence', exact: true }).click();
  await page.getByRole('link', { name: 'Background', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${dealPath}/background$`));
  await expectRedAmberGreen(page, businessName);
  const source = page.getByRole('link', { name: 'View source' }).first();
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer');

  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('No background findings')).toBeVisible({
      timeout: 2000,
    });
    await expect(page.getByRole('button', { name: 'Run again' })).toBeEnabled({
      timeout: 2000,
    });
  }).toPass({ timeout: 90 * 1000 });
  await expect(
    page.getByText('Connect a CourtListener token to search federal courts'),
  ).toBeVisible();
  await expect(
    page.getByText('Connect an email lookup provider to search news'),
  ).toBeVisible();

  const history = page
    .getByRole('navigation', { name: 'Report history' })
    .getByRole('link');
  await expect(history).toHaveCount(2);
  await history.last().click();
  await expect(page).toHaveURL(/\?search=/);
  await expectRedAmberGreen(page, businessName);

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
      `background at ${width}px`,
    ).toBeLessThanOrEqual(0);
  }
});
