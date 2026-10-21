import {
  completeTeamOnboarding,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

const team = newCredentials();

test('a checklist item is edited in place: waiting on, then a note', async ({
  page,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const itemTitle = `Landlord estoppel letter ${stamp}`;
  const noteBody = `Landlord promised it by Friday ${stamp}`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, `Checklist Team ${stamp}`);
  const { dealPath } = await createDeal(page, teamSlug, `Checklist Deal ${stamp}`);

  await page.goto(`${dealPath}/diligence`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByLabel('New item title').fill(itemTitle);
  await page.getByRole('button', { name: 'Add item' }).click();
  const row = page.getByRole('row').filter({ hasText: itemTitle });
  await expect(row).toBeVisible();

  await row.getByLabel(`Waiting on for ${itemTitle}`).selectOption('seller');
  await expect(row.getByLabel(`Waiting on for ${itemTitle}`)).toHaveValue('seller');

  await page.getByRole('button', { name: 'Waiting on seller' }).click();
  await expect(row).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();

  await row.getByRole('button', { name: `Details for ${itemTitle}` }).click();
  await page.getByLabel('Add a note').fill(noteBody);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(noteBody)).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('row').filter({ hasText: itemTitle }).getByLabel(`Waiting on for ${itemTitle}`),
  ).toHaveValue('seller');
});
