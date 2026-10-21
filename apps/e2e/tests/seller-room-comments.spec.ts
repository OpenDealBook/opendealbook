import type { Browser } from '@playwright/test';

import {
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

test("seller's counsel comments on a file reach the seller live and stay hidden from buyer's counsel", async ({
  page,
  browser,
  auth,
  cleanup,
  seller: sellerFlow,
  counsel,
}) => {
  test.setTimeout(180 * 1000);

  const stamp = Date.now();
  const sellerPerson = { email: newCredentials().email, name: `Sal Seller ${stamp}` };
  const sellerCounsel = { email: newCredentials().email, name: `Cora Counsel ${stamp}` };
  const buyerCounsel = { email: newCredentials().email, name: `Bea Buyer ${stamp}` };
  const fileName = `schedule-${stamp}.txt`;

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Comment Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Comment Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(`${dealPath}/parties`);
  await sellerFlow.invite(page, sellerPerson);
  const sellerSide = await freshPage(browser);
  const roomId = await sellerFlow.signIn(sellerSide.page, { email: sellerPerson.email });
  await counsel.inviteSellerCounsel(sellerSide.page, sellerCounsel);
  const counselSide = await freshPage(browser);
  await counsel.signIn(counselSide.page, { email: sellerCounsel.email, dealId });

  await page.goto(`${dealPath}/parties`);
  await counsel.inviteBuyerCounsel(page, buyerCounsel);
  const buyerSide = await freshPage(browser);
  await counsel.signIn(buyerSide.page, { email: buyerCounsel.email, dealId });

  await sellerSide.page.goto(`/seller/rooms/${roomId}`);
  await sellerSide.page
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('button', { name: 'Uploads' })
    .click();
  await sellerSide.page.getByLabel('Add files', { exact: true }).setInputFiles({
    name: fileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('schedule'),
  });
  await expect(sellerSide.page.getByRole('button', { name: fileName, exact: true })).toBeVisible();
  await counselSide.page.goto(`/counsel/${dealId}/seller-room`);

  const comment = `Please redact the totals ${stamp}`;
  await counselSide.page.getByLabel(`Comment on ${fileName}`).fill(comment);
  await counselSide.page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(counselSide.page.getByText(comment)).toBeVisible();
  await expect(sellerSide.page.getByText(comment).first()).toBeVisible();

  expect((await buyerSide.page.goto(`/counsel/${dealId}/seller-room`))!.status()).toBe(404);

  await sellerSide.context.close();
  await counselSide.context.close();
  await buyerSide.context.close();
});
