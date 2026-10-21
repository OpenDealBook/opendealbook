import {
  completeTeamOnboarding,
  db,
  expect,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

test('a bell notice opens the offer and highlights it briefly, and a gone checklist item says so', async ({
  page,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const owner = await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Link Team ${stamp}`);
  const { dealPath } = await createDeal(page, teamSlug, `Link Deal ${stamp}`);

  await page.goto(`${dealPath}/financials`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Create offer' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Purchase price (required)').fill('750000');
  await dialog.getByRole('button', { name: 'Save version' }).click();
  await expect(dialog).toBeHidden();
  const actions = page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Add buyer revision' }) })
    .last();
  await actions.getByRole('button', { name: 'Submit' }).click();

  const ownerId = await db.userIdByEmail(owner.email);
  await expect
    .poll(
      async () =>
        (await db.rows('notifications', `recipient_user_id=eq.${ownerId}&select=id`)).length,
      { timeout: 60 * 1000 },
    )
    .toBeGreaterThan(0);

  await page.goto(`/home/${teamSlug}`);
  await page.locator('button:has(svg.lucide-bell)').click();
  await page.getByRole('link', { name: /Offer submitted/ }).first().click();
  await expect(page).toHaveURL(/\/financials#offer-[0-9a-f-]{36}$/);
  const anchor = new URL(page.url()).hash.slice(1);
  const target = page.locator(`#${anchor}`);
  await expect(target).toBeVisible();
  await expect(target).toHaveClass(/bg-accent/);
  await expect(target).not.toHaveClass(/bg-accent/, { timeout: 6000 });

  await page.goto(`${dealPath}/diligence#checklist-item-00000000-0000-4000-8000-000000000000`);
  await expect(page.getByText('That item is no longer available.')).toBeVisible();
});
