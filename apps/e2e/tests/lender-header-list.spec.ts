import {
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

const team = newCredentials();

test('a lender sees the buyer team and loan ask in the room header and the list', async ({
  page,
  browser,
  auth,
  cleanup,
  lender: lenderFlow,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const teamName = `Header Team ${stamp}`;
  const businessName = `Header Deal ${stamp}`;
  const lenderPerson = { email: newCredentials().email, name: `Lena Lender ${stamp}` };
  const roomName = `Harbor Lending ${stamp}`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, teamName);
  const { dealId, dealPath } = await createDeal(page, teamSlug, businessName);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(`${dealPath}/lenders`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByLabel('Must close by').fill('2027-03-31');
  await page.getByLabel('Why that date').fill(`Seller retires ${stamp}`);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save deadline' }).click(),
  ]);
  await page.getByLabel('Loan amount ($)').fill('2000000');
  await page.getByLabel('Seller note ($)').fill('300000');
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save terms' }).click(),
  ]);
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel('Loan amount ($)')).toHaveValue('2,000,000', {
      timeout: 3000,
    });
    await expect(page.getByLabel('Must close by')).toHaveValue('2027-03-31', {
      timeout: 3000,
    });
  }).toPass({ timeout: 60 * 1000 });

  await page.getByRole('button', { name: 'Create the first lender room' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a lender room' });
  await dialog.getByLabel('Lender name').fill(roomName);
  await dialog.getByRole('button', { name: 'Create room' }).click();
  await page.waitForURL(/\/lenders\/[0-9a-f-]{36}\?tab=people$/);
  const roomId = new URL(page.url()).pathname.split('/').pop()!;
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await lenderFlow.invite(page, lenderPerson);
  await expect(page.getByRole('tab', { name: 'People (1)' })).toBeVisible();
  expect(
    await db.rows('lender_room', `id=eq.${roomId}&select=id`),
  ).toHaveLength(1);

  const lenderContext = await browser.newContext();
  const lenderPage = await lenderContext.newPage();
  await lenderFlow.signIn(lenderPage, { email: lenderPerson.email, roomId });

  await expect(lenderPage.getByText(teamName).first()).toBeVisible();
  await expect(
    lenderPage.getByText('$2,000,000').first(),
  ).toBeVisible();
  await expect(lenderPage.getByText('plus $300,000 seller note').first()).toBeVisible();
  await expect(lenderPage.getByText(/Mar 31, 2027|March 31, 2027/).first()).toBeVisible();

  await lenderPage.goto('/lender');
  const listed = lenderPage.getByRole('link').filter({ hasText: businessName });
  await expect(listed).toContainText(teamName);
  await expect(listed).toContainText('$2,000,000');
  await expect(listed).toContainText(`Prepared for ${roomName}`);
  await expect(listed).toContainText('Open');
  await listed.click();
  await lenderPage.waitForURL(new RegExp(`/lender/${roomId}$`));

  await lenderContext.close();
});
