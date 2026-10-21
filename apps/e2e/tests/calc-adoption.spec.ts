import {
  completeInviteeOnboarding,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { addTeamMember, calcRowAction, newDealCalc, saveCalc, setField } from './fixtures/calc';
import { createDeal } from './fixtures/deal';

test('a changed primary calc flags the adoption, the manager re-adopts, and an analyst is told who can', async ({
  page,
  browser,
  auth,
}) => {
  test.setTimeout(180 * 1000);

  const stamp = Date.now();
  const owner = newCredentials();
  await auth.signUp(page, owner);
  const teamSlug = await completeTeamOnboarding(page, `Adopt Team ${stamp}`);
  const { dealPath } = await createDeal(page, teamSlug, `Adopt Deal ${stamp}`);
  const financials = `${dealPath}/financials`;
  const calcPath = `${financials}/calcs`;

  const calcId = await newDealCalc(page, financials);
  await page.goto(financials);
  const row = page.getByRole('row').filter({ hasText: /DSCR \d+\.\d\dx/ });
  await calcRowAction(page, row, 'Mark primary');
  await expect(row.getByText('Primary')).toBeVisible();
  await calcRowAction(page, row, 'Adopt');
  await expect(page.getByText('No financials adopted yet')).toHaveCount(0);
  await expect(page.getByText('Primary calc changed since adoption')).toHaveCount(0);

  await page.goto(dealPath);
  await expect(page.getByText('Asking multiple (SDE)')).toBeVisible();
  await expect(page.getByText('Not disclosed').first()).toBeVisible();

  const edit = async (label: string, value: string) => {
    await page.goto(`${calcPath}/${calcId}`);
    await setField(page, label, value);
    await saveCalc(page);
    await page.goto(financials);
  };

  await edit('Sales', '2600000');
  await expect(page.getByText('Primary calc changed since adoption')).toBeVisible();
  await page.getByRole('button', { name: 'Re-adopt' }).click();
  await expect(page.getByText('Primary calc changed since adoption')).toHaveCount(0);

  await edit('Working capital', '110000');
  await expect(page.getByText('Primary calc changed since adoption')).toHaveCount(0);

  await edit('Sales', '3000000');
  await expect(page.getByText('Primary calc changed since adoption')).toBeVisible();

  const analyst = newCredentials();
  const analystContext = await browser.newContext();
  const analystPage = await analystContext.newPage();
  await auth.signUp(analystPage, analyst);
  await addTeamMember(teamSlug, await db.userIdByEmail(analyst.email), 'analyst');
  await completeInviteeOnboarding(analystPage, teamSlug, 'Alex Analyst');
  await analystPage.goto(financials);
  await expect(analystPage.getByText('Primary calc changed since adoption')).toBeVisible();
  await expect(analystPage.getByText(/^Only deal managers can re-adopt\. Ask /)).toBeVisible();
  await expect(analystPage.getByRole('button', { name: 'Re-adopt' })).toBeDisabled();
  await analystContext.close();
});
