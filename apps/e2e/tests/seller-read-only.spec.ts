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

test('a closed seller room and an archived deal turn the seller side read-only', async ({
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

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `ReadOnly Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `ReadOnly Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(`${dealPath}/parties`);
  await sellerFlow.invite(page, sellerPerson);
  const sellerSide = await freshPage(browser);
  const roomId = await sellerFlow.signIn(sellerSide.page, { email: sellerPerson.email });
  await counsel.inviteSellerCounsel(sellerSide.page, sellerCounsel);
  const counselSide = await freshPage(browser);
  await counsel.signIn(counselSide.page, { email: sellerCounsel.email, dealId });

  const closedReason = 'The seller room is closed, so this is read-only.';
  const sellerRoom = card(page, 'Seller room');
  await page.goto(`${dealPath}/parties`);
  await sellerRoom.getByRole('button', { name: 'Close room' }).click();
  await expect(async () => {
    await page.goto(`${dealPath}/todos`);
    await page
      .getByRole('listitem')
      .filter({ hasText: /the room is closing/ })
      .getByRole('checkbox')
      .click({ timeout: 3000 });
  }).toPass({ timeout: 60 * 1000 });
  await expect(page.getByRole('checkbox', { checked: false })).toHaveCount(0);
  await page.goto(`${dealPath}/parties`);
  await sellerRoom.getByRole('button', { name: 'Close room' }).click();
  await page
    .getByRole('dialog', { name: 'Close the seller room?' })
    .getByRole('button', { name: 'Close this room' })
    .click();
  await expect(sellerRoom.getByRole('button', { name: 'Reopen room' })).toBeVisible();

  await sellerSide.page.goto(`/seller/rooms/${roomId}`);
  await expect(sellerSide.page.getByText(closedReason)).toHaveCount(1);
  await expect(sellerSide.page.getByLabel('Add files', { exact: true })).toHaveCount(0);
  await sellerSide.page.goto(`/seller/rooms/${roomId}/counsel`);
  await expect(sellerSide.page.getByText(closedReason).first()).toBeVisible();
  await expect(sellerSide.page.getByLabel('Message')).toHaveCount(0);
  await counselSide.page.goto(`/counsel/${dealId}/client`);
  await expect(counselSide.page.getByText(closedReason).first()).toBeVisible();
  await counselSide.page.goto(`/counsel/${dealId}/seller-room`);
  await expect(counselSide.page.getByLabel('Add files', { exact: true })).toHaveCount(0);

  await sellerRoom.getByRole('button', { name: 'Reopen room' }).click();
  await expect(sellerRoom.getByRole('button', { name: 'Close room' })).toBeVisible();
  await sellerSide.page.goto(`/seller/rooms/${roomId}`);
  await expect(sellerSide.page.getByText(closedReason)).toHaveCount(0);

  await page.goto(dealPath);
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('button', { name: 'Unarchive' })).toBeVisible();
  const archivedReason = 'This deal has closed, so everything here is read-only.';
  await sellerSide.page.goto(`/seller/rooms/${roomId}`);
  await expect(sellerSide.page.getByText(archivedReason).first()).toBeVisible();
  await expect(sellerSide.page.getByRole('button', { name: 'Ask to reopen' })).toHaveCount(0);

  await counselSide.page.goto(`/counsel/${dealId}`);
  await expect(counselSide.page).toHaveURL(new RegExp(`/counsel/${dealId}/client$`));
  await expect(counselSide.page.getByText(archivedReason).first()).toBeVisible();
  await expect(counselSide.page.getByRole('navigation').getByRole('link')).toHaveCount(1);
  await counselSide.page.goto('/counsel');
  await expect(counselSide.page.getByText('Closed deals')).toBeVisible();
  await expect(counselSide.page.getByText(/^Read-only until /)).toBeVisible();
});
