import type { Browser } from '@playwright/test';

import {
  card,
  completeTeamOnboarding,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const team = newCredentials();
const seller = { email: newCredentials().email, name: `Sal Seller ${Date.now()}` };
const buyerCounsel = {
  email: newCredentials().email,
  name: `Bea Buyer-Counsel ${Date.now()}`,
};
const sellerCounsel = {
  email: newCredentials().email,
  name: `Cora Seller-Counsel ${Date.now()}`,
};

test('an APA can be sent for signature only after both counsel approve it', async ({
  page,
  browser,
  auth,
  cleanup,
  seller: sellerFlow,
  counsel,
  contracts,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, `Sign Off Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Sign Off Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });
  await contracts.seed({
    dealId,
    type: 'apa',
    versions: [{ party: 'buyer', summary: `APA draft ${stamp}`, shared: true }],
  });

  await page.goto(`${dealPath}/parties`);
  await counsel.inviteBuyerCounsel(page, buyerCounsel);
  await sellerFlow.invite(page, seller);
  const buyerCounselSide = await freshPage(browser);
  await counsel.signIn(buyerCounselSide.page, { email: buyerCounsel.email, dealId });
  const sellerSide = await freshPage(browser);
  await sellerFlow.signIn(sellerSide.page, { email: seller.email });
  await counsel.inviteSellerCounsel(sellerSide.page, sellerCounsel);
  const sellerCounselSide = await freshPage(browser);
  await counsel.signIn(sellerCounselSide.page, { email: sellerCounsel.email, dealId });

  const review = (on: typeof page) =>
    card(on, 'APA').locator('[data-version-review]').first();

  await page.goto(`${dealPath}/documents`);
  await review(page).getByRole('button', { name: 'Ask counsel to review' }).click();
  await expect(review(page)).toContainText('Waiting since');
  await expect(review(page).getByRole('button', { name: 'Override and send' })).toBeVisible();
  await expect(review(page).getByRole('button', { name: 'Send for signature' })).toHaveCount(0);

  for (const { page: counselPage } of [buyerCounselSide, sellerCounselSide]) {
    await counselPage.goto(`/counsel/${dealId}/contracts`);
    await counselPage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    const section = card(counselPage, 'APA').locator('[data-version-review]').first();
    await section.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(section).toContainText('Approved on');
  }

  await page.goto(`${dealPath}/documents`);
  await expect(review(page)).toContainText("Buyer's counsel: Approved");
  await expect(review(page)).toContainText("Seller's counsel: Approved");
  await expect(review(page).getByRole('button', { name: 'Send for signature' })).toBeVisible();
  await expect(review(page).getByRole('button', { name: 'Override and send' })).toHaveCount(0);
});
