import type { Browser, Locator, Page } from '@playwright/test';

import {
  card,
  completeTeamOnboarding,
  expect,
  test,
} from './fixtures';
import type { Auth } from './fixtures/auth';
import { createDeal } from './fixtures/deal';
import {
  DOCUMENSO_VIEWPORT,
  openDocumensoSender,
  placeSignaturesAndSend,
  signDocumentFromEmail,
} from './fixtures/documenso';
import { templateDocument } from '@odb/templates/test-support/docx-template.ts';
import type { Seller } from './fixtures/seller';

test.use({ actionTimeout: 30 * 1000 });

const DAY = 86_400_000;

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

const medium = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

const SIGNED_PDF = {
  name: 'signed.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
};

function comboboxWithText(scope: Page | Locator, text: string) {
  return scope.getByRole('combobox').filter({ hasText: text });
}

async function settled(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
}

function timelineRow(page: Page, name: string) {
  return card(page, 'Timeline').getByRole('row').filter({ hasText: name });
}

function extensionRow(page: Page, extendsTo: string) {
  return page
    .locator('[data-extension]')
    .filter({ has: page.getByRole('heading', { name: `LOI extension to ${medium(extendsTo)}`, exact: true }) });
}

function extensionState(extension: Locator) {
  return extension.locator('[data-slot="badge"]').first();
}

async function teamDay(page: Page, teamSlug: string) {
  await page.goto(`/home/${teamSlug}/settings`);
  const zone = await page.getByLabel('Time zone', { exact: true }).inputValue();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());

  return (days: number) => addDays(today, days);
}

async function dealWithSignedLoi(
  page: Page,
  auth: Auth,
  { loiSignedDaysAgo, exclusivityDays }: { loiSignedDaysAgo: number; exclusivityDays: number },
) {
  const stamp = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;
  const owner = await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Extension Team ${stamp}`);
  const day = await teamDay(page, teamSlug);
  const firmName = `Juniper Bakery ${stamp}`;
  const { dealPath } = await createDeal(page, teamSlug, firmName);

  await page.goto(`${dealPath}/financials`);
  await settled(page);
  await page.getByRole('button', { name: 'Create offer' }).click();
  const offer = page.getByRole('dialog');
  await offer.getByLabel('Purchase price (required)').fill('900000');
  await offer.getByLabel('Exclusivity (days)').fill(String(exclusivityDays));
  await offer.getByRole('button', { name: 'Save version' }).click();
  await expect(offer).toBeHidden();
  const offerActions = page.locator('[id^="offer-"]');
  await offerActions.getByRole('button', { name: 'Submit' }).click();
  await expect(comboboxWithText(page, 'LOI Submitted')).toBeVisible({ timeout: 30 * 1000 });
  await offerActions.getByRole('button', { name: 'Accept' }).click();

  await page.goto(`${dealPath}/documents`);
  await settled(page);
  await page.getByRole('button', { name: 'Record signed LOI', exact: true }).click();
  const signedLoi = page.getByRole('dialog', { name: 'Record signed LOI' });
  await signedLoi.getByLabel('Signed copy').setInputFiles(SIGNED_PDF);
  await signedLoi.getByLabel('Signing date').fill(day(-loiSignedDaysAgo));
  await signedLoi.getByLabel('Buyer').check();
  await signedLoi.getByRole('button', { name: 'Record signed LOI' }).click();
  await expect(signedLoi).toBeHidden({ timeout: 30 * 1000 });
  await expect(comboboxWithText(page, 'LOI Accepted')).toBeVisible({ timeout: 30 * 1000 });

  return { owner, teamSlug, dealPath, firmName, day };
}

async function inviteSeller(
  page: Page,
  browser: Browser,
  sellerFlow: Seller,
  dealPath: string,
  seller: { email: string; name: string },
) {
  await page.goto(`${dealPath}/parties`);
  await sellerFlow.invite(page, seller);
  await expect(card(page, 'Seller room').getByRole('status')).toHaveText(
    `Invite sent to ${seller.email}`,
  );
  const context = await browser.newContext();
  const sellerPage = await context.newPage();
  const roomId = await sellerFlow.signIn(sellerPage, { email: seller.email });

  return { sellerPage, roomPath: `/seller/rooms/${roomId}`, close: () => context.close() };
}

async function extendExclusivity(
  page: Page,
  dealPath: string,
  extendsTo: string,
  way: 'Generate from the template' | 'Note as agreed by email',
  agreement?: { note: string; notedOn: string },
) {
  await page.goto(`${dealPath}/documents`);
  await settled(page);
  await card(page, 'LOI').getByRole('button', { name: 'Extend exclusivity' }).click();
  const dialog = page.getByRole('dialog', { name: 'Extend exclusivity' });
  await dialog.getByLabel('New end date').fill(extendsTo);
  await dialog.getByLabel(way).check();
  if (agreement) {
    await dialog.getByLabel('What was agreed').fill(agreement.note);
    await dialog.getByLabel('Agreed on').fill(agreement.notedOn);
  }
  await dialog.getByRole('button', { name: 'Extend exclusivity' }).click();
  await expect(dialog).toBeHidden({ timeout: 60 * 1000 });
}

test('an extension generated from a template and signed in Documenso moves exclusivity, reaches the seller and notifies the team', async ({
  page,
  browser,
  auth,
  seller: sellerFlow,
}) => {
  test.setTimeout(600 * 1000);

  const stamp = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;
  const seller = { email: `seller-${stamp}@tuckin.test`, name: `Sasha Seller ${stamp}` };

  const { owner, teamSlug, dealPath, firmName, day } = await dealWithSignedLoi(page, auth, {
    loiSignedDaysAgo: 10,
    exclusivityDays: 30,
  });
  const originalEnd = day(20);
  const extendsTo = day(60);
  const buyerSigner = { email: owner.email, name: `Bianca Buyer ${stamp}` };

  await page.goto(`/home/${teamSlug}/settings/templates/new`);
  await settled(page);
  await page.getByLabel('Name').fill(`Extension ${stamp}`);
  await page.getByLabel('Type').click();
  await page.getByRole('option', { name: 'LOI extension', exact: true }).click();
  await page.getByLabel('Document (.docx)').setInputFiles({
    name: 'loi-extension.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: templateDocument([
      'Letter of intent signed on {{loi_signed_date}}.',
      'Exclusivity was to end on {{exclusivity_end_date}}.',
      'Exclusivity now ends on {{new_exclusivity_end_date}}.',
    ]),
  });
  await expect(page.getByRole('heading', { name: 'Fields (3)' })).toBeVisible({ timeout: 30 * 1000 });
  await page.getByRole('button', { name: 'Save template' }).click();
  await page.waitForURL(`/home/${teamSlug}/settings/templates`);

  const { sellerPage, roomPath, close } = await inviteSeller(page, browser, sellerFlow, dealPath, seller);

  await page.goto(dealPath);
  await expect(timelineRow(page, 'Exclusivity ends')).toContainText(medium(originalEnd));

  await extendExclusivity(page, dealPath, extendsTo, 'Generate from the template');
  const extension = extensionRow(page, extendsTo);
  await expect(extensionState(extension)).toHaveText('Draft');

  await extension.getByRole('button', { name: 'Send for signature' }).click();
  const request = page.getByRole('dialog', { name: 'Send for signature' });
  await request.getByLabel('Signer 1 name').fill(buyerSigner.name);
  await request.getByLabel('Signer 1 email').fill(buyerSigner.email);
  await request.getByRole('button', { name: 'Add signer' }).click();
  await request.getByLabel('Signer 2 name').fill(seller.name);
  await request.getByLabel('Signer 2 email').fill(seller.email);
  await request.getByRole('button', { name: 'Send for signature' }).click();
  await expect(request).toBeHidden({ timeout: 60 * 1000 });
  await page.reload();
  await expect(extensionState(extensionRow(page, extendsTo))).toHaveText('Out for signature');

  const editorUrl = await extensionRow(page, extendsTo)
    .getByRole('link', { name: 'Open in Documenso to place signature fields' })
    .getAttribute('href');
  const sender = await openDocumensoSender(browser);
  await placeSignaturesAndSend(
    sender,
    editorUrl!,
    [buyerSigner.name, seller.name],
  );
  for (const signer of [buyerSigner, seller]) {
    const context = await browser.newContext({ viewport: DOCUMENSO_VIEWPORT });
    await signDocumentFromEmail(await context.newPage(), signer);
    await context.close();
  }
  await sender.context().close();

  await expect(async () => {
    await page.goto(`${dealPath}/documents`);
    await expect(
      extensionRow(page, extendsTo).getByRole('link', { name: 'Signed copy' }),
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 180 * 1000 });
  await expect(extensionState(extensionRow(page, extendsTo))).toHaveText('Signed');

  await page.goto(dealPath);
  await expect(timelineRow(page, 'Exclusivity ends')).toContainText(medium(extendsTo));
  await expect(timelineRow(page, `LOI extension to ${medium(extendsTo)}`)).toContainText('Shared');

  await sellerPage.goto(roomPath);
  await expect(
    sellerPage.getByRole('row').filter({ hasText: `LOI extension to ${medium(extendsTo)}` }),
  ).toBeVisible();
  await expect(
    sellerPage.getByRole('row').filter({ hasText: 'Exclusivity ends' }),
  ).toContainText(medium(extendsTo));

  await sellerPage.goto(`${roomPath}/contracts`);
  const sellerExtension = extensionRow(sellerPage, extendsTo);
  await expect(extensionState(sellerExtension)).toHaveText('Signed');
  const signedPdf = sellerExtension.getByRole('link', { name: 'Signed copy' });
  const pdfResponse = await sellerPage.request.get(
    new URL((await signedPdf.getAttribute('href'))!, sellerPage.url()).href,
  );
  expect(pdfResponse.status()).toBe(200);
  expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const notice = `LOI extension to ${medium(extendsTo)} signed on ${firmName}`;
  await expect(async () => {
    await page.goto(`/home/${teamSlug}`);
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(page.getByRole('link', { name: notice })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 120 * 1000 });
  await page.getByRole('link', { name: notice }).click();
  await expect(page).toHaveURL(new RegExp(`${dealPath}/documents`));

  await close();
});

test('an extension noted as agreed by email, then given a signed copy, moves exclusivity once', async ({
  page,
  auth,
}) => {
  test.setTimeout(180 * 1000);

  const note = 'Seller agreed by email to thirty more days';

  const { dealPath, day } = await dealWithSignedLoi(page, auth, {
    loiSignedDaysAgo: 10,
    exclusivityDays: 30,
  });
  const originalEnd = day(20);
  const extendsTo = day(50);
  const notedOn = day(-1);
  await page.goto(dealPath);
  await expect(timelineRow(page, 'Exclusivity ends')).toContainText(medium(originalEnd));

  await extendExclusivity(page, dealPath, extendsTo, 'Note as agreed by email', {
    note,
    notedOn,
  });
  const extension = extensionRow(page, extendsTo);
  await expect(extensionState(extension)).toHaveText('Noted');
  await expect(extension).toContainText(`Agreed on ${medium(notedOn)}: ${note}`);

  await extension.getByRole('button', { name: 'Record signed LOI extension' }).click();
  const signed = page.getByRole('dialog', { name: 'Record signed LOI extension' });
  await signed.getByLabel('Signed copy').setInputFiles(SIGNED_PDF);
  await signed.getByLabel('Signing date').fill(day(0));
  await signed.getByLabel('Seller').check();
  await signed.getByRole('button', { name: 'Record signed LOI extension' }).click();
  await expect(signed).toBeHidden({ timeout: 30 * 1000 });

  await page.reload();
  await expect(extensionState(extension)).toHaveText('Signed');
  await expect(extension).toContainText(`Agreed on ${medium(notedOn)}: ${note}`);
  await expect(extension.getByRole('link', { name: 'Signed copy' })).toBeVisible();

  await page.goto(dealPath);
  await expect(timelineRow(page, 'Exclusivity ends')).toContainText(medium(extendsTo));
  await expect(card(page, 'Timeline').getByRole('row').filter({ hasText: /^LOI extension to/ })).toHaveCount(1);
  await expect(
    card(page, 'Timeline')
      .getByRole('listitem')
      .filter({ hasText: /^Exclusivity ends set: target/ }),
  ).toHaveText([
    new RegExp(`^Exclusivity ends set: target ${medium(extendsTo)}`),
    new RegExp(`^Exclusivity ends set: target ${medium(originalEnd)}`),
  ]);
});

test('an extension noted after exclusivity already ended is flagged lapsed for the team only', async ({
  page,
  browser,
  auth,
  seller: sellerFlow,
}) => {
  test.setTimeout(180 * 1000);

  const stamp = `${Date.now()}${crypto.randomUUID().slice(0, 6)}`;
  const seller = { email: `seller-${stamp}@tuckin.test`, name: `Rowan Seller ${stamp}` };

  const { dealPath, day } = await dealWithSignedLoi(page, auth, {
    loiSignedDaysAgo: 60,
    exclusivityDays: 30,
  });
  const originalEnd = day(-30);
  const extendsTo = day(30);
  const { sellerPage, roomPath, close } = await inviteSeller(page, browser, sellerFlow, dealPath, seller);

  await page.goto(dealPath);
  await expect(timelineRow(page, 'Exclusivity ends')).toContainText(medium(originalEnd));
  await expect(timelineRow(page, 'Exclusivity ends')).toContainText('Lapsed');

  await extendExclusivity(page, dealPath, extendsTo, 'Note as agreed by email', {
    note: 'Agreed on a call, confirmed by email',
    notedOn: day(-1),
  });
  await expect(extensionState(extensionRow(page, extendsTo))).toHaveText('Noted');

  await page.goto(dealPath);
  const extensionOnTimeline = timelineRow(page, `LOI extension to ${medium(extendsTo)}`);
  await expect(extensionOnTimeline).toContainText('Lapsed');
  await expect(timelineRow(page, 'Exclusivity ends')).toContainText(medium(extendsTo));
  await expect(timelineRow(page, 'Exclusivity ends')).not.toContainText('Lapsed');

  await sellerPage.goto(roomPath);
  await expect(
    sellerPage.getByRole('row').filter({ hasText: `LOI extension to ${medium(extendsTo)}` }),
  ).toBeVisible();
  await expect(sellerPage.getByText('Lapsed')).toHaveCount(0);

  await sellerPage.goto(`${roomPath}/contracts`);
  await expect(sellerPage.getByRole('heading', { name: 'Contracts', level: 1 })).toBeVisible();
  await expect(sellerPage.locator('[data-extension]')).toHaveCount(0);

  await close();
});
