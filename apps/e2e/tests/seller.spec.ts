import type { Browser } from '@playwright/test';

import {
  card,
  completeInviteeOnboarding,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
  waitForMessage,
} from './fixtures';
import { createDeal } from './fixtures/deal';

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const team = newCredentials();
const approver = newCredentials();
const seller = {
  email: newCredentials().email,
  name: `Sam Seller ${Date.now()}`,
};
const teamName = `Seller Room Team ${Date.now()}`;

test('seller journey: invite, sign in, uploads, questions, contracts, timeline, updates, close', async ({
  page,
  browser,
  auth,
  cleanup,
  seller: sellerFlow,
  contracts,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const dealDescription = `Seller Room Deal ${stamp}`;
  const uploadName = `tax-returns-${stamp}.txt`;
  const questionTitle = `Who holds the lease ${stamp}`;
  const answerText = `The landlord is my cousin ${stamp}`;
  const draftSummary = `Internal draft ${stamp}`;
  const sharedSummary = `First offer to the seller ${stamp}`;
  const openNote = `Please confirm the inventory count ${stamp}`;
  const internalNote = `Our walk-away price ${stamp}`;
  const sellerNote = `Inventory is 412 units ${stamp}`;
  const sharedMilestone = `Site visit ${stamp}`;
  const teamOnlyMilestone = `Lender call ${stamp}`;
  const updateSubject = `Closing moves to December ${stamp}`;
  const updateBody = `The lender needs two more weeks ${stamp}`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, teamName);
  const { dealId } = await createDeal(page, teamSlug, dealDescription);
  const dealPath = `/home/${teamSlug}/deals/${dealId}`;
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(`${dealPath}/parties`);
  const sellerRoom = card(page, 'Seller room');
  await sellerFlow.invite(page, seller);
  await expect(sellerRoom.getByRole('status')).toHaveText(
    `Invite sent to ${seller.email}`,
  );

  const sellerSide = await freshPage(browser);
  const sellerPage = sellerSide.page;
  const roomId = await sellerFlow.signIn(sellerPage, { email: seller.email });
  const roomPath = `/seller/rooms/${roomId}`;
  const sellerUserId = await db.userIdByEmail(seller.email);

  await expect(
    sellerPage.getByRole('heading', {
      name: `Selling ${dealDescription}`,
      level: 1,
    }),
  ).toBeVisible();
  await expect(sellerPage.getByText(`with ${teamName}`)).toBeVisible();
  await sellerPage.reload();
  await expect(
    sellerPage.getByRole('heading', {
      name: `Selling ${dealDescription}`,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    sellerPage.getByLabel('Add a phone number (optional)'),
  ).toHaveCount(0);

  await sellerPage
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('button', { name: 'Uploads' })
    .click();
  await sellerPage.getByLabel('Add files', { exact: true }).setInputFiles({
    name: uploadName,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Three years of returns ${stamp}`),
  });
  await expect(
    sellerPage.getByRole('button', { name: uploadName, exact: true }),
  ).toBeVisible({ timeout: 30 * 1000 });
  expect(
    await db.rows(
      'dr_document',
      `deal_id=eq.${dealId}&uploaded_by=eq.${sellerUserId}&select=name`,
    ),
  ).toEqual([{ name: uploadName }]);

  await page.reload();
  await sellerRoom.getByRole('button', { name: 'Ask the seller' }).click();
  await sellerRoom.getByLabel('Question for the seller').fill(questionTitle);
  await sellerRoom
    .getByRole('button', { name: 'Send to the seller room' })
    .click();
  await expect(sellerRoom.getByText('Asked in the seller room')).toBeVisible();

  await sellerPage.reload();
  await expect(
    sellerPage.getByRole('heading', { name: `Questions from ${teamName}` }),
  ).toBeVisible();
  const question = sellerPage
    .getByRole('article')
    .filter({ hasText: questionTitle });
  await question.getByLabel('Your answer').fill(answerText);
  await question.getByRole('button', { name: 'Send answer' }).click();
  await expect(
    question.getByRole('listitem').filter({ hasText: answerText }),
  ).toContainText('You:');

  await page.reload();
  await expect(
    sellerRoom.getByRole('listitem').filter({ hasText: answerText }),
  ).toContainText('Seller:');

  const [draftId, sharedId] = await contracts.seed({
    dealId,
    versions: [
      { party: 'buyer', summary: draftSummary },
      { party: 'buyer', summary: sharedSummary },
    ],
  });
  await page.goto(`${dealPath}/documents`);
  const teamLoi = card(page, 'LOI');
  const sharedRow = teamLoi.getByRole('row').filter({ hasText: sharedSummary });
  await sharedRow
    .getByRole('button', { name: 'Share with seller side' })
    .click();
  await expect(
    sharedRow.getByRole('button', { name: 'Stop sharing' }),
  ).toBeVisible();

  const teamNewComment = teamLoi
    .locator('[data-version-comments]')
    .filter({
      has: page.getByRole('heading', { name: 'Comments on version 2' }),
    })
    .locator('[data-new-comment]');
  await teamNewComment.getByLabel('Comment', { exact: true }).fill(openNote);
  await teamNewComment.getByRole('button', { name: 'Post comment' }).click();
  await expect(teamLoi.getByText(openNote)).toBeVisible();
  await expect(
    teamNewComment.getByLabel('Comment', { exact: true }),
  ).toHaveValue('');
  await teamNewComment
    .getByLabel('Comment', { exact: true })
    .fill(internalNote);
  await expect(
    teamNewComment.getByRole('button', { name: 'Post comment' }),
  ).toBeEnabled();
  await teamNewComment.getByLabel('Internal (buyer side only)').check();
  await teamNewComment.getByRole('button', { name: 'Post comment' }).click();
  await expect(teamLoi.getByText(internalNote)).toBeVisible();

  await sellerPage.goto(`${roomPath}/contracts`);
  const sellerLoi = card(sellerPage, 'LOI');
  await expect(
    sellerLoi.getByRole('row').filter({ hasText: sharedSummary }),
  ).toContainText(/^1/);
  await expect(sellerPage.getByText(draftSummary)).toHaveCount(0);
  await expect(
    sellerLoi.getByRole('heading', { name: /^Comments on version/ }),
  ).toHaveText(['Comments on version 1']);
  await expect(sellerLoi.getByText(openNote)).toBeVisible();
  await expect(sellerPage.getByText(internalNote)).toHaveCount(0);

  const sellerNewComment = sellerLoi.locator('[data-new-comment]');
  await expect(
    sellerNewComment.getByLabel('Internal (buyer side only)'),
  ).toHaveCount(0);
  await sellerNewComment
    .getByLabel('Comment', { exact: true })
    .fill(sellerNote);
  await sellerNewComment.getByRole('button', { name: 'Post comment' }).click();
  await expect(sellerLoi.getByText(sellerNote)).toBeVisible();

  const contractFile = (versionId: string) =>
    sellerPage.request.get(`${roomPath}/contracts/files/${versionId}/docx`);
  expect((await contractFile(sharedId!)).status()).toBe(200);
  expect((await contractFile(draftId!)).status()).toBe(404);

  await page.reload();
  await expect(teamLoi.getByText(sellerNote)).toBeVisible();

  await page.goto(dealPath);
  const timeline = card(page, 'Timeline');
  for (const { label, shared } of [
    { label: sharedMilestone, shared: true },
    { label: teamOnlyMilestone, shared: false },
  ]) {
    await timeline.getByRole('button', { name: 'Add milestone' }).click();
    await timeline.getByLabel('Name').fill(label);
    await timeline.getByLabel('Target').fill('2026-12-01');
    await timeline.getByLabel('Shared').setChecked(shared);
    await timeline.getByRole('button', { name: 'Save' }).click();
    await expect(
      timeline.getByRole('row').filter({ hasText: label }),
    ).toContainText(shared ? 'Shared' : 'Team only');
  }

  await sellerPage.goto(roomPath);
  await expect(
    sellerPage.getByRole('row').filter({ hasText: sharedMilestone }),
  ).toContainText('Dec 1, 2026');
  await expect(sellerPage.getByText(teamOnlyMilestone)).toHaveCount(0);

  await page.goto(`${dealPath}/parties`);
  await sellerRoom.getByRole('button', { name: 'Close room' }).click();
  await expect(
    sellerRoom.getByRole('button', { name: 'Close room' }),
  ).toBeDisabled();

  await page.goto(dealPath);
  const updates = card(page, 'Updates');
  await updates.getByLabel('Update subject').fill(updateSubject);
  await updates.getByLabel('Update body').fill(updateBody);
  await updates.getByLabel('Send to Sellers').check();
  await updates.getByRole('button', { name: 'Save draft' }).click();
  await updates.getByRole('button', { name: `Submit ${updateSubject}` }).click();
  await expect(
    updates.getByRole('button', { name: `Submit ${updateSubject}` }),
  ).toHaveCount(0);
  await expect(
    updates.getByRole('button', { name: `Approve ${updateSubject}` }),
  ).toHaveCount(0);

  const approverSide = await freshPage(browser);
  const approverPage = approverSide.page;
  await auth.signUp(approverPage, approver);
  const [teamAccount] = await db.rows<{ id: string }>(
    'accounts',
    `slug=eq.${teamSlug}&select=id`,
  );
  await db.insert('accounts_memberships', {
    account_id: teamAccount!.id,
    user_id: await db.userIdByEmail(approver.email),
    account_role: 'admin',
  });
  await completeInviteeOnboarding(approverPage, teamSlug);

  await approverPage.goto(dealPath);
  const approverUpdates = card(approverPage, 'Updates');
  await expect(
    approverUpdates.getByRole('list', {
      name: `Recipients of ${updateSubject}`,
    }),
  ).toContainText(seller.email);
  await approverUpdates
    .getByRole('button', { name: `Approve ${updateSubject}` })
    .click();
  await expect(
    approverUpdates.getByRole('list', {
      name: `Delivery of ${updateSubject}`,
    }),
  ).toContainText(seller.email);

  const delivered = await waitForMessage({
    to: seller.email,
    subject: new RegExp(updateSubject),
  });
  expect(delivered.text).toContain(updateBody);

  await sellerPage.reload();
  const sellerUpdates = sellerPage
    .getByRole('listitem')
    .filter({ has: sellerPage.getByRole('heading', { name: updateSubject }) });
  await expect(sellerUpdates).toContainText(updateBody);

  await page.goto(`${dealPath}/parties`);
  await sellerRoom.getByRole('button', { name: 'Close room' }).click();
  await page
    .getByRole('dialog', { name: 'Close the seller room?' })
    .getByRole('button', { name: 'Close this room' })
    .click();
  await expect(
    sellerRoom.getByRole('button', { name: 'Reopen room' }),
  ).toBeVisible();

  await sellerPage.reload();
  await expect(
    sellerPage.getByText('The seller room is closed, so this is read-only.').first(),
  ).toBeVisible();
  await sellerPage
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('button', { name: 'Uploads' })
    .click();
  await expect(sellerPage.getByRole('button', { name: uploadName, exact: true })).toBeVisible();
  await expect(sellerPage.getByLabel('Add files', { exact: true })).toHaveCount(0);
  await sellerPage.getByRole('button', { name: 'Ask to reopen' }).click();
  await expect(
    sellerPage.getByText('Your request has been sent.'),
  ).toBeVisible();

  await sellerSide.context.close();
  await approverSide.context.close();
});
