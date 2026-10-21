import type { Browser } from '@playwright/test';

import {
  completeTeamOnboarding,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';
import { waitForMessageContaining } from './fixtures/mail';

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test('the seller and their counsel share a private thread with attachments that the buyer side cannot reach', async ({
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

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Thread Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Thread Deal ${stamp}`);
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
  const buyerCounselSide = await freshPage(browser);
  await counsel.signIn(buyerCounselSide.page, { email: buyerCounsel.email, dealId });

  const threadPath = `/seller/rooms/${roomId}/counsel`;
  const clientPath = `/counsel/${dealId}/client`;
  await counselSide.page.goto(clientPath);
  await sellerSide.page.goto(threadPath);
  await expect(
    sellerSide.page.getByText(
      `Private to you and ${sellerCounsel.name}; Thread Team ${stamp} cannot see this. ${sellerCounsel.name} gets an email.`,
    ),
  ).toBeVisible();

  const body = `Please review the schedule ${stamp}`;
  await sellerSide.page.getByLabel('Message').fill(body);
  await sellerSide.page.getByLabel('Attach files').setInputFiles({
    name: 'P&L.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a real workbook'),
  });
  await sellerSide.page.getByRole('button', { name: 'Send' }).click();
  await expect(sellerSide.page.getByText(body)).toBeVisible();
  await expect(sellerSide.page.getByRole('link', { name: 'P&L.xlsx' })).toBeVisible();

  const arrivedLive = await expect(counselSide.page.getByText(body))
    .toBeVisible()
    .then(
      () => true,
      () => false,
    );
  if (!arrivedLive) {
    await counselSide.page.reload();
    await expect(counselSide.page.getByText(body)).toBeVisible();
  }
  expect(arrivedLive, 'the message reached the open counsel page without a reload').toBe(true);
  const emailed = await waitForMessageContaining({
    to: sellerCounsel.email,
    text: `/counsel/${dealId}/client#seller-counsel-message-`,
  });
  expect(emailed.html + emailed.text).toMatch(/#seller-counsel-message-[0-9a-f-]{36}/);
  const [download] = await Promise.all([
    counselSide.page.waitForEvent('download'),
    counselSide.page.getByRole('link', { name: 'P&L.xlsx' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('P&L.xlsx');

  await counselSide.page.getByLabel('Attach files').setInputFiles({
    name: 'only-a-file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await counselSide.page.getByRole('button', { name: 'Send' }).click();
  await expect(counselSide.page.getByRole('link', { name: 'only-a-file.txt' })).toBeVisible();
  await expect(sellerSide.page.getByRole('link', { name: 'only-a-file.txt' })).toBeVisible();

  await sellerSide.page.getByLabel('Attach files').setInputFiles(
    Array.from({ length: 21 }, (_, index) => ({
      name: `f${index}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('x'),
    })),
  );
  await sellerSide.page.getByRole('button', { name: 'Send' }).click();
  await expect(sellerSide.page.getByText('Attach at most 20 files to one message.')).toBeVisible();
  await sellerSide.page.getByLabel('Attach files').setInputFiles([]);
  await sellerSide.page.getByLabel('Message').fill('x'.repeat(10_001));
  await sellerSide.page.getByRole('button', { name: 'Send' }).click();
  await expect(sellerSide.page.getByText('A message can be at most 10,000 characters.')).toBeVisible();

  for (const [outsider, path] of [
    [page, threadPath],
    [buyerCounselSide.page, threadPath],
    [buyerCounselSide.page, clientPath],
  ] as const) {
    expect((await outsider.goto(path))!.status()).toBe(404);
  }

  await sellerSide.context.close();
  await counselSide.context.close();
  await buyerCounselSide.context.close();
});
