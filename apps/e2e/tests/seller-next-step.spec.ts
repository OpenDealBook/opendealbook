import {
  card,
  completeTeamOnboarding,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

const team = newCredentials();

test('the seller room names the next step once the team asks a question', async ({
  page,
  browser,
  auth,
  cleanup,
  seller: sellerFlow,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const seller = { email: newCredentials().email, name: `Sam Seller ${stamp}` };
  const question = `Who holds the equipment lease ${stamp}`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, `Next Step Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Next Step Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(`${dealPath}/parties`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await sellerFlow.invite(page, seller);
  await expect(card(page, 'Seller room').getByRole('status')).toHaveText(
    `Invite sent to ${seller.email}`,
  );

  const sellerContext = await browser.newContext();
  const sellerPage = await sellerContext.newPage();
  const roomId = await sellerFlow.signIn(sellerPage, { email: seller.email });

  await expect(sellerPage.getByRole('heading', { name: 'Next step', exact: true })).toBeVisible();
  await expect(sellerPage.getByText('Nothing needed from you today')).toBeVisible();

  const sellerRoom = card(page, 'Seller room');
  await sellerRoom.getByRole('button', { name: 'Ask the seller' }).click();
  await sellerRoom.getByLabel('Question for the seller').fill(question);
  await sellerRoom.getByRole('button', { name: 'Send to the seller room' }).click();
  await expect(sellerRoom.getByText('Asked in the seller room')).toBeVisible();

  await sellerPage.goto(`/seller/rooms/${roomId}`);
  const nextStep = sellerPage.locator('section[aria-labelledby="next-step"]');
  await expect(nextStep.getByText(`Answer: ${question}`)).toBeVisible();

  await sellerContext.close();
});
