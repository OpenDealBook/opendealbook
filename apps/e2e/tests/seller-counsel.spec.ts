import type { Browser } from '@playwright/test';

import {
  card,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  REDLINE_DOCX,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const team = newCredentials();
const seller = {
  email: newCredentials().email,
  name: `Sal Seller ${Date.now()}`,
};
const counselPerson = {
  email: newCredentials().email,
  name: `Cora Sellers-Counsel ${Date.now()}`,
};
const teamName = `Seller Counsel Team ${Date.now()}`;

test("seller's counsel journey: invited by the seller, filtered contracts, seller room, messages, cross-side refusal", async ({
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
  const dealDescription = `Seller Counsel Deal ${stamp}`;
  const draftSummary = `Internal buyer draft ${stamp}`;
  const sharedSummary = `Shared LOI ${stamp}`;
  const internalNote = `Do not show the seller side ${stamp}`;
  const redlineSummary = `Seller counsel markup ${stamp}`;
  const counselUpload = `disclosure-schedule-${stamp}.txt`;
  const counselMessage = `Our client needs a longer transition ${stamp}`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, teamName);
  const { dealId } = await createDeal(page, teamSlug, dealDescription);
  const portal = `/counsel/${dealId}`;
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  const [draftId, sharedId] = await contracts.seed({
    dealId,
    versions: [
      { party: 'buyer', summary: draftSummary },
      { party: 'buyer', summary: sharedSummary, shared: true },
    ],
  });

  const dealPath = `/home/${teamSlug}/deals/${dealId}`;
  await page.goto(`${dealPath}/parties`);
  await sellerFlow.invite(page, seller);
  await expect(card(page, 'Seller room').getByRole('status')).toHaveText(
    `Invite sent to ${seller.email}`,
  );
  const sellerSide = await freshPage(browser);
  const sellerPage = sellerSide.page;
  const roomId = await sellerFlow.signIn(sellerPage, { email: seller.email });

  await counsel.inviteSellerCounsel(sellerPage, counselPerson);
  await expect(card(sellerPage, 'Your counsel').getByRole('status')).toHaveText(
    `Invite sent to ${counselPerson.email}`,
  );

  const counselSide = await freshPage(browser);
  const counselPage = counselSide.page;
  await counsel.signIn(counselPage, { email: counselPerson.email, dealId });
  await expect(
    counselPage.getByText("Seller's counsel", { exact: true }),
  ).toBeVisible();
  await expect(counselPage.getByRole('link', { name: 'Data room' })).toHaveCount(0);
  await expect(
    counselPage.getByRole('link', { name: 'Seller questions' }),
  ).toHaveCount(0);
  expect((await counselPage.goto(`${portal}/data-room`))!.status()).toBe(404);
  expect((await counselPage.goto(`${portal}/questions`))!.status()).toBe(404);

  await page.goto(`${dealPath}/documents`);
  const teamLoi = card(page, 'LOI');
  const teamNewComment = teamLoi
    .locator('[data-version-comments]')
    .filter({
      has: page.getByRole('heading', { name: 'Comments on version 2' }),
    })
    .locator('[data-new-comment]');
  await teamNewComment
    .getByLabel('Comment', { exact: true })
    .fill(internalNote);
  await teamNewComment.getByLabel('Internal (buyer side only)').check();
  await teamNewComment.getByRole('button', { name: 'Post comment' }).click();
  await expect(teamLoi.getByText(internalNote)).toBeVisible();

  await counselPage.goto(`${portal}/contracts`);
  const counselLoi = card(counselPage, 'LOI');
  await expect(
    counselLoi.getByRole('row').filter({ hasText: sharedSummary }),
  ).toContainText(/^1Buyer/);
  await expect(counselPage.getByText(draftSummary)).toHaveCount(0);
  await expect(counselPage.getByText(internalNote)).toHaveCount(0);

  const contractFile = (versionId: string) =>
    counselPage.request.get(`${portal}/contracts/files/${versionId}/docx`);
  expect((await contractFile(sharedId!)).status()).toBe(200);
  expect((await contractFile(draftId!)).status()).toBe(404);

  await counselLoi.getByLabel('Redline (.docx)').setInputFiles(REDLINE_DOCX);
  await counselLoi.getByLabel('What changed (optional)').fill(redlineSummary);
  await counselLoi.getByRole('button', { name: 'Upload redline' }).click();
  await expect(
    counselLoi.getByRole('row').filter({ hasText: redlineSummary }),
  ).toContainText(/^2Seller/);

  await page.reload();
  await expect(
    teamLoi.getByRole('row').filter({ hasText: redlineSummary }),
  ).toContainText(/^3Seller/);

  await counselPage.goto(`/seller/rooms/${roomId}`);
  await expect(
    counselPage.getByRole('heading', {
      name: `Selling ${dealDescription}`,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    counselPage.getByRole('heading', { name: 'Your counsel' }),
  ).toHaveCount(0);
  await counselPage
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('button', { name: 'Uploads' })
    .click();
  await counselPage.getByLabel('Add files', { exact: true }).setInputFiles({
    name: counselUpload,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Disclosure schedule ${stamp}`),
  });
  await expect(
    counselPage.getByRole('button', { name: counselUpload, exact: true }),
  ).toBeVisible({ timeout: 30 * 1000 });

  await sellerPage.reload();
  await sellerPage
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('button', { name: 'Uploads' })
    .click();
  await expect(
    sellerPage.getByRole('button', { name: counselUpload, exact: true }),
  ).toBeVisible();

  await page.goto(`${dealPath}/parties`);
  await counselPage.goto(`${portal}/messages`);
  await expect(
    counselPage.getByRole('heading', {
      name: "Buyer's counsel and the deal team",
    }),
  ).toHaveCount(0);
  await counselPage.getByLabel('Message').fill(counselMessage);
  await counselPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(counselPage.getByText(counselMessage)).toBeVisible();

  await expect(
    card(page, "Seller's counsel").getByText(counselMessage),
  ).toBeVisible();
  await expect(
    card(page, "Buyer's counsel").getByText(counselMessage),
  ).toHaveCount(0);

  await page.goto(`${dealPath}/parties`);
  await counsel.inviteBuyerCounsel(page, { email: counselPerson.email });
  await expect(card(page, 'Counsel').getByRole('alert')).toHaveText(
    'This person is already on another side of this deal.',
  );
  expect(
    await db.rows(
      'deal_counsel',
      `deal_id=eq.${dealId}&email=eq.${encodeURIComponent(counselPerson.email)}&select=side`,
    ),
  ).toEqual([{ side: 'seller' }]);

  await sellerSide.context.close();
  await counselSide.context.close();
});
