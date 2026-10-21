import type { Browser } from '@playwright/test';

import {
  card,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  REDLINE_DOCX,
  test,
  waitForMessage,
} from './fixtures';
import { createDeal } from './fixtures/deal';

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const team = newCredentials();
const counselPerson = {
  email: newCredentials().email,
  name: `Bea Buyers-Counsel ${Date.now()}`,
};
const teamName = `Buyer Counsel Team ${Date.now()}`;

test("buyer's counsel journey: invite, sign in, data room, seller Q&A, messages, contracts", async ({
  page,
  browser,
  auth,
  cleanup,
  counsel,
  contracts,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const dealDescription = `Buyer Counsel Deal ${stamp}`;
  const packageName = `cim-${stamp}.txt`;
  const counselUpload = `diligence-memo-${stamp}.txt`;
  const questionTitle = `Any pending litigation ${stamp}`;
  const counselMessage = `Please send the lease assignment ${stamp}`;
  const teamReply = `Attached to the data room ${stamp}`;
  const draftSummary = `Buyer draft LOI ${stamp}`;
  const redlineSummary = `Counsel redline ${stamp}`;
  const counselComment = `Tighten the exclusivity clause ${stamp}`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, teamName);
  const { dealId } = await createDeal(page, teamSlug, dealDescription);
  const dealPath = `/home/${teamSlug}/deals/${dealId}`;
  const portal = `/counsel/${dealId}`;
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(`${dealPath}/lenders`);
  await page.getByRole('button', { name: 'Start the lender package' }).click();
  await page.getByLabel('Add files', { exact: true }).setInputFiles({
    name: packageName,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Confidential information memorandum ${stamp}`),
  });
  await expect(
    page.getByRole('link', { name: `Download ${packageName}` }),
  ).toBeVisible({ timeout: 30 * 1000 });

  await page.goto(`${dealPath}/parties`);
  await counsel.inviteBuyerCounsel(page, counselPerson);
  await expect(card(page, 'Counsel').getByRole('status')).toHaveText(
    `Invite sent to ${counselPerson.email}`,
  );

  const counselSide = await freshPage(browser);
  const counselPage = counselSide.page;
  await counsel.signIn(counselPage, { email: counselPerson.email, dealId });
  await expect(
    counselPage.getByRole('heading', { name: dealDescription, level: 1 }),
  ).toBeVisible();
  await expect(counselPage.getByText("Buyer's counsel", { exact: true })).toBeVisible();
  await expect(counselPage.getByRole('link', { name: 'Data room' })).toBeVisible();
  await expect(
    counselPage.getByRole('link', { name: 'Seller questions' }),
  ).toBeVisible();
  await counselPage.reload();
  await expect(counselPage.getByRole('button', { name: 'Skip' })).toHaveCount(0);

  await counselPage.getByRole('link', { name: 'Data room' }).click();
  await counselPage.waitForURL(`${portal}/data-room`);
  const packageLink = counselPage.getByRole('link', {
    name: packageName,
    exact: true,
  });
  const download = await counselPage.request.get(
    (await packageLink.getAttribute('href'))!,
    { maxRedirects: 0 },
  );
  expect(download.status()).toBe(307);

  await counselPage.getByLabel('Upload files').setInputFiles({
    name: counselUpload,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Our diligence notes ${stamp}`),
  });
  const uploadedGroup = counselPage
    .getByRole('heading', { level: 2, name: /Buyer's counsel/ })
    .locator('xpath=..');
  await expect(
    uploadedGroup.getByRole('link', { name: counselUpload, exact: true }),
  ).toBeVisible({ timeout: 30 * 1000 });

  await page.reload();
  await expect(
    card(page, 'Counsel').getByRole('row').filter({ hasText: packageName }),
  ).toBeVisible();

  const sellerRoom = card(page, 'Seller room');
  await sellerRoom.getByRole('button', { name: 'Ask the seller' }).click();
  await sellerRoom.getByLabel('Question for the seller').fill(questionTitle);
  await sellerRoom
    .getByRole('button', { name: 'Send to the seller room' })
    .click();
  await expect(sellerRoom.getByText('Asked in the seller room')).toBeVisible();

  await counselPage.goto(`${portal}/questions`);
  const question = counselPage
    .getByRole('article')
    .filter({ hasText: questionTitle });
  await expect(question).toContainText('Open');
  const questionsPage = counselPage.getByRole('main');
  await expect(questionsPage.getByRole('textbox')).toHaveCount(0);
  await expect(questionsPage.getByRole('button')).toHaveCount(0);

  await counselPage.goto(`${portal}/messages`);
  await expect(
    counselPage.getByRole('heading', {
      name: "Seller's counsel and the deal team",
    }),
  ).toHaveCount(0);
  await counselPage.getByLabel('Message').fill(counselMessage);
  await counselPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(counselPage.getByText(counselMessage)).toBeVisible();

  await waitForMessage({
    to: team.email,
    subject: /New message from buyer's counsel/,
  });
  const teamUserId = await db.userIdByEmail(team.email);
  await db.waitForRow(
    'notifications',
    `recipient_user_id=eq.${teamUserId}&body=like.${encodeURIComponent("New message from buyer's counsel*")}`,
  );

  await page.reload();
  const buyerThread = card(page, "Buyer's counsel");
  await expect(buyerThread.getByText(counselMessage)).toBeVisible();
  await buyerThread.getByLabel('Message').fill(teamReply);
  await buyerThread.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(buyerThread.getByText(teamReply)).toBeVisible();

  await waitForMessage({
    to: counselPerson.email,
    subject: /New message from the deal team/,
  });
  await counselPage.reload();
  await expect(
    counselPage.getByRole('listitem').filter({ hasText: teamReply }),
  ).toContainText('Deal team');

  await contracts.seed({
    dealId,
    versions: [{ party: 'buyer', summary: draftSummary }],
  });
  await counselPage.goto(`${portal}/contracts`);
  const counselLoi = card(counselPage, 'LOI');
  await expect(
    counselLoi.getByRole('row').filter({ hasText: draftSummary }),
  ).toBeVisible();
  await counselLoi.getByLabel('Redline (.docx)').setInputFiles(REDLINE_DOCX);
  await counselLoi.getByLabel('What changed (optional)').fill(redlineSummary);
  await counselLoi.getByRole('button', { name: 'Upload redline' }).click();
  await expect(
    counselLoi.getByRole('row').filter({ hasText: redlineSummary }),
  ).toContainText(/^2Buyer/);

  const counselNewComment = counselLoi
    .locator('[data-version-comments]')
    .filter({
      has: counselPage.getByRole('heading', { name: 'Comments on version 2' }),
    })
    .locator('[data-new-comment]');
  await counselNewComment
    .getByLabel('Comment', { exact: true })
    .fill(counselComment);
  await counselNewComment.getByLabel('Internal (buyer side only)').check();
  await counselNewComment.getByRole('button', { name: 'Post comment' }).click();
  await expect(counselLoi.getByText(counselComment)).toBeVisible();

  await page.goto(`${dealPath}/documents`);
  const teamLoi = card(page, 'LOI');
  const redlineRow = teamLoi.getByRole('row').filter({ hasText: redlineSummary });
  await expect(teamLoi.getByRole('row').filter({ hasText: draftSummary })).toContainText(
    'Current',
  );
  await redlineRow.getByRole('button', { name: 'Make current' }).click();
  await expect(redlineRow).toContainText('Current');
  await expect
    .poll(async () => {
      const [contract] = await db.rows<{ current_version: number }>(
        'contract',
        `deal_id=eq.${dealId}&select=current_version`,
      );
      return contract!.current_version;
    })
    .toBe(2);

  const internalComment = teamLoi
    .locator('[data-comment]')
    .filter({ hasText: counselComment });
  await expect(internalComment).toContainText("Buyer's counsel");
  await expect(internalComment).toContainText('Internal');

  await counselSide.context.close();
});
