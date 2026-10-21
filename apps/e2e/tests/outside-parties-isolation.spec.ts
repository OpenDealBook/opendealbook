import type { Browser, Page } from '@playwright/test';

import {
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function createRoomByName(page: Page, openLabel: string, name: string) {
  await page.getByRole('button', { name: openLabel }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a lender room' });
  await dialog.getByLabel('Lender name').fill(name);
  await dialog.getByRole('button', { name: 'Create room' }).click();
  await page.waitForURL(/\/lenders\/[0-9a-f-]{36}\?tab=people$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function uploadedBy(dealId: string, email: string): Promise<string> {
  const [document] = await db.rows<{ id: string }>(
    'dr_document',
    `deal_id=eq.${dealId}&uploaded_by=eq.${await db.userIdByEmail(email)}&select=id`,
  );
  return document!.id;
}

function status(page: Page, path: string): Promise<number> {
  return page.request
    .get(path, { maxRedirects: 0 })
    .then((response) => response.status());
}

const team = newCredentials();
const stamp = Date.now();
const lenderA = { email: newCredentials().email, name: `Alma Lender ${stamp}` };
const lenderB = { email: newCredentials().email, name: `Bert Lender ${stamp}` };
const seller = { email: newCredentials().email, name: `Sid Seller ${stamp}` };
const buyerCounsel = { email: newCredentials().email };
const sellerCounsel = { email: newCredentials().email };
const teamName = `Isolation Team ${stamp}`;

test("outside parties are refused each other's pages and files", async ({
  page,
  browser,
  auth,
  cleanup,
  lender,
  seller: sellerFlow,
  counsel,
  contracts,
}) => {
  test.setTimeout(240 * 1000);

  const dealDescription = `Isolation Deal ${stamp}`;
  const packageName = `teaser-${stamp}.txt`;
  const roomAName = `Alpine Bank ${stamp}`;
  const roomBName = `Bayside Credit ${stamp}`;
  const lenderBFile = `bayside-term-sheet-${stamp}.txt`;
  const sellerFile = `seller-payroll-${stamp}.txt`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, teamName);
  const { dealId } = await createDeal(page, teamSlug, dealDescription);
  const dealPath = `/home/${teamSlug}/deals/${dealId}`;
  const lendersPath = `${dealPath}/lenders`;
  const portal = `/counsel/${dealId}`;
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(lendersPath);
  await page.getByRole('button', { name: 'Start the lender package' }).click();
  await page.getByLabel('Add files', { exact: true }).setInputFiles({
    name: packageName,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Teaser ${stamp}`),
  });
  await expect(
    page.getByRole('link', { name: `Download ${packageName}` }),
  ).toBeVisible({ timeout: 30 * 1000 });
  const [packageDocument] = await db.rows<{ id: string }>(
    'dr_document',
    `deal_id=eq.${dealId}&name=eq.${encodeURIComponent(packageName)}&select=id`,
  );
  const packageId = packageDocument!.id;

  const roomA = await createRoomByName(page, 'Create the first lender room', roomAName);
  await lender.invite(page, lenderA);
  await expect(page.getByText(`${lenderA.name} (${lenderA.email})`)).toBeVisible();
  await page.goto(lendersPath);
  const roomB = await createRoomByName(page, 'Create lender room', roomBName);
  await lender.invite(page, lenderB);
  await expect(page.getByText(`${lenderB.name} (${lenderB.email})`)).toBeVisible();

  const [draftId, sharedId] = await contracts.seed({
    dealId,
    versions: [
      { party: 'buyer', summary: `Hidden draft ${stamp}` },
      { party: 'buyer', summary: `Shared draft ${stamp}`, shared: true },
    ],
  });

  const lenderBSide = await freshPage(browser);
  await lender.signIn(lenderBSide.page, { email: lenderB.email, roomId: roomB });
  await lenderBSide.page
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('button', { name: 'Your files' })
    .click();
  await lenderBSide.page.getByLabel('Add files', { exact: true }).setInputFiles({
    name: lenderBFile,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Bayside terms ${stamp}`),
  });
  await expect(
    lenderBSide.page.getByRole('button', { name: lenderBFile, exact: true }),
  ).toBeVisible({ timeout: 30 * 1000 });
  const lenderBDocument = await uploadedBy(dealId, lenderB.email);

  await page.goto(`${dealPath}/parties`);
  await sellerFlow.invite(page, seller);
  const sellerSide = await freshPage(browser);
  const sellerRoomId = await sellerFlow.signIn(sellerSide.page, {
    email: seller.email,
  });
  const sellerRoom = `/seller/rooms/${sellerRoomId}`;
  await sellerSide.page
    .getByRole('navigation', { name: 'Folders' })
    .getByRole('button', { name: 'Uploads' })
    .click();
  await sellerSide.page.getByLabel('Add files', { exact: true }).setInputFiles({
    name: sellerFile,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Payroll ${stamp}`),
  });
  await expect(
    sellerSide.page.getByRole('button', { name: sellerFile, exact: true }),
  ).toBeVisible({ timeout: 30 * 1000 });
  const sellerDocument = await uploadedBy(dealId, seller.email);

  await counsel.inviteSellerCounsel(sellerSide.page, sellerCounsel);
  const sellerCounselSide = await freshPage(browser);
  await counsel.signIn(sellerCounselSide.page, {
    email: sellerCounsel.email,
    dealId,
  });

  await page.reload();
  await counsel.inviteBuyerCounsel(page, buyerCounsel);
  const buyerCounselSide = await freshPage(browser);
  await counsel.signIn(buyerCounselSide.page, {
    email: buyerCounsel.email,
    dealId,
  });

  const lenderASide = await freshPage(browser);
  await lender.signIn(lenderASide.page, { email: lenderA.email, roomId: roomA });

  const lenderFile = (roomId: string, documentId: string) =>
    `/lender/${roomId}/files/${documentId}?disposition=download`;
  const sellerRoomFile = (documentId: string) =>
    `${sellerRoom}/files/${documentId}?disposition=download`;
  const dataRoomFile = (documentId: string) =>
    `${portal}/data-room/files/${documentId}?disposition=download`;
  const contractFile = (versionId: string) =>
    `${portal}/contracts/files/${versionId}/docx`;

  const lenderAPage = lenderASide.page;
  await expect(lenderAPage.getByText(roomBName)).toHaveCount(0);
  await expect(lenderAPage.getByText(lenderB.name)).toHaveCount(0);
  expect((await lenderAPage.goto(`/lender/${roomB}`))!.status()).toBe(404);
  expect(await status(lenderAPage, lenderFile(roomA, packageId))).toBe(307);
  expect(await status(lenderAPage, lenderFile(roomB, lenderBDocument))).toBe(404);
  expect(await status(lenderAPage, lenderFile(roomA, lenderBDocument))).toBe(404);

  const sellerPage = sellerSide.page;
  await sellerPage.goto(sellerRoom);
  await expect(sellerPage.getByText(roomAName)).toHaveCount(0);
  await expect(sellerPage.getByText(roomBName)).toHaveCount(0);
  await expect(sellerPage.getByText(lenderA.name)).toHaveCount(0);
  await expect(sellerPage.getByText(lenderB.name)).toHaveCount(0);
  expect((await sellerPage.goto(`/lender/${roomA}`))!.status()).toBe(404);
  expect(await status(sellerPage, sellerRoomFile(sellerDocument))).toBe(307);
  expect(await status(sellerPage, lenderFile(roomA, packageId))).toBe(404);

  const sellerCounselPage = sellerCounselSide.page;
  expect((await sellerCounselPage.goto(`${portal}/data-room`))!.status()).toBe(404);
  expect((await sellerCounselPage.goto(`${portal}/questions`))!.status()).toBe(404);
  expect(await status(sellerCounselPage, dataRoomFile(packageId))).toBe(404);
  expect(await status(sellerCounselPage, contractFile(sharedId!))).toBe(200);
  expect(await status(sellerCounselPage, contractFile(draftId!))).toBe(404);

  const buyerCounselPage = buyerCounselSide.page;
  expect((await buyerCounselPage.goto(sellerRoom))!.status()).toBe(404);
  expect(await status(buyerCounselPage, sellerRoomFile(sellerDocument))).toBe(404);
  expect(await status(buyerCounselPage, dataRoomFile(packageId))).toBe(307);
  expect(await status(buyerCounselPage, dataRoomFile(lenderBDocument))).toBe(404);
  expect(await status(buyerCounselPage, contractFile(draftId!))).toBe(200);

  for (const side of [
    lenderASide,
    lenderBSide,
    sellerSide,
    sellerCounselSide,
    buyerCounselSide,
  ]) {
    await side.context.close();
  }
});
