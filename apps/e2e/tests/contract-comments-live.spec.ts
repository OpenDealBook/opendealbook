import {
  card,
  completeTeamOnboarding,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

test('contract comments and resolve or reopen reach the other side without a reload', async ({
  page,
  browser,
  auth,
  cleanup,
  counsel,
  contracts,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const counselPerson = { email: newCredentials().email, name: `Bea Counsel ${stamp}` };

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Live Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Live Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });
  await contracts.seed({
    dealId,
    versions: [{ party: 'buyer', summary: `Draft ${stamp}`, shared: true }],
  });

  await page.goto(`${dealPath}/parties`);
  await counsel.inviteBuyerCounsel(page, counselPerson);
  const counselContext = await browser.newContext();
  const counselPage = await counselContext.newPage();
  await counsel.signIn(counselPage, { email: counselPerson.email, dealId });

  await page.goto(`${dealPath}/documents`);
  await counselPage.goto(`/counsel/${dealId}/contracts`);

  const body = `Is the price firm ${stamp}`;
  const team = card(page, 'LOI');
  const theirs = card(counselPage, 'LOI');
  const newComment = team.locator('[data-new-comment]').last();
  await newComment.getByLabel('Comment', { exact: true }).fill(body);
  await newComment.getByRole('button', { name: 'Post comment' }).click();

  await expect(theirs.getByText(body)).toBeVisible();
  await theirs.getByRole('button', { name: 'Resolve' }).click();
  await expect(team.getByText(/^Resolved: /)).toBeVisible();
  await team.getByText(/^Resolved: /).click();
  await team.getByRole('button', { name: 'Reopen' }).click();
  await expect(theirs.getByRole('button', { name: 'Resolve' })).toBeVisible();

  await counselContext.close();
});
