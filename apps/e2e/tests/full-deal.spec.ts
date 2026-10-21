import type { Browser, Locator, Page } from '@playwright/test';

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

import {
  DOCUMENSO_VIEWPORT,
  openDocumensoSender,
  placeSignaturesAndSend,
  signDocumentFromEmail,
} from './fixtures/documenso';

import { setFirmOwnerNames } from './fixtures/db-update';
import { calcRowAction } from './fixtures/calc';
import { createDeal } from './fixtures/deal';
import { gmail } from './fixtures/stand-ins';
import { wordDocument, wordDocumentText } from './fixtures/docx';

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

function templateFixture(name: string): string {
  return fileURLToPath(
    new URL(`../../../packages/templates/fixtures/${name}`, import.meta.url),
  );
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

function comboboxWithText(scope: Page | Locator, text: string) {
  return scope.getByRole('combobox').filter({ hasText: text });
}

async function selectOption(combobox: Locator, optionName: string) {
  const page = combobox.page();
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await combobox.click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

function labelledInput(scope: Locator, label: string) {
  return scope
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::*[self::input or descendant::input][1]')
    .locator('xpath=descendant-or-self::input')
    .first();
}

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

const utcToday = () => new Date().toISOString().slice(0, 10);

const longDate = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'long',
  });

const medium = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });

async function editMilestone(
  timeline: Locator,
  name: string,
  { target, actual }: { target?: string; actual?: string },
) {
  await expect(async () => {
    await timeline.page().waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await timeline
      .getByRole('row')
      .filter({ hasText: name })
      .getByRole('button', { name: 'Edit' })
      .click({ timeout: 5000 });
    if (target !== undefined) {
      await timeline.getByLabel('Target').fill(target, { timeout: 5000 });
    }
    if (actual !== undefined) {
      await timeline.getByLabel('Actual').fill(actual, { timeout: 5000 });
    }
    await timeline
      .getByRole('button', { name: 'Save', exact: true })
      .click({ timeout: 5000 });
    await expect(timeline.getByLabel('Target')).toHaveCount(0, { timeout: 5000 });
  }).toPass({ timeout: 60 * 1000 });
}

async function postComment(scope: Locator, body: string) {
  const newComment = scope.locator('[data-new-comment]').last();
  await newComment.getByLabel('Comment', { exact: true }).fill(body);
  await newComment.getByRole('button', { name: 'Post comment' }).click();
  await expect(scope.getByText(body)).toBeVisible({ timeout: 60 * 1000 });
}

test.use({ actionTimeout: 30 * 1000 });

async function expectNotice(ownerId: string, body: string) {
  await expect
    .configure({ soft: true })
    .poll(
      async () =>
        (
          await db.rows(
            'notifications',
            `recipient_user_id=eq.${ownerId}&body=eq.${encodeURIComponent(body)}`,
          )
        ).length,
      { message: `an in-app notice "${body}"`, timeout: 90 * 1000 },
    )
    .toBeGreaterThan(0);
}

const team = newCredentials();
const secondAdmin = newCredentials();
const seller = { email: newCredentials().email, name: `Sam Seller ${Date.now()}` };
const buyerCounsel = {
  email: newCredentials().email,
  name: `Bea Buyers-Counsel ${Date.now()}`,
};
const sellerCounsel = {
  email: newCredentials().email,
  name: `Cora Sellers-Counsel ${Date.now()}`,
};
const teamName = `Full Deal Team ${Date.now()}`;

test('full deal: team, financials, LOI, diligence, lenders, APA, closing, timeline', async ({
  page,
  browser,
  auth,
  cleanup,
  seller: sellerFlow,
  lender: lenderFlow,
  counsel,
}) => {
  test.setTimeout(2_400 * 1000);

  const stamp = Date.now();
  let teamSlug = '';
  let dealId = '';
  let dealPath = '';
  const firmName = `Harbor Plumbing ${stamp}`;
  const legalEntityName = `Harbor Acquisition Holdings ${stamp} LLC`;

  await test.step('1. Team: sign up, onboard, create the deal', async () => {
    await auth.signUp(page, team);
    teamSlug = await completeTeamOnboarding(page, teamName);
    await page.goto('/home');
    await expect(page).toHaveURL(new RegExp(`/home/${teamSlug}(/|$)`));

    await page.goto(`/home/${teamSlug}/settings/templates/new`);
    for (const { name, type, file } of [
      { name: `Standard LOI ${stamp}`, type: 'LOI', file: 'loi-standard.docx' },
      { name: `Standard APA ${stamp}`, type: 'APA', file: 'apa-short.docx' },
    ]) {
      await page.goto(`/home/${teamSlug}/settings/templates/new`);
      await page.getByLabel('Name').fill(name);
      await selectOption(page.getByLabel('Type'), type);
      await page.getByLabel('Document (.docx)').setInputFiles(templateFixture(file));
      await expect(page.getByRole('heading', { name: /^Fields \(/ })).toBeVisible({
        timeout: 30 * 1000,
      });
      await page.getByRole('button', { name: 'Save template' }).click();
      await page.waitForURL(`/home/${teamSlug}/settings/templates`);
      await expect(page.getByRole('cell', { name })).toBeVisible();
    }

    ({ dealId, dealPath } = await createDeal(page, teamSlug, firmName));
    cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

    const [deal] = await db.rows<{ firm_id: string }>(
      'deal',
      `id=eq.${dealId}&select=firm_id`,
    );
    await setFirmOwnerNames(deal!.firm_id, [seller.name]);

    await page.goto(`/home/${teamSlug}/settings/checklists`);
    for (const starter of [
      'Standard Diligence',
      'Standard Closing',
      'Day 0 Takeover',
      'First 90 Days',
    ]) {
      await expect(page.getByText(starter).first()).toBeVisible();
    }
    await expect(page.getByText('Default').first()).toBeVisible();
  });

  await test.step('2. Financials: P&L, funding, close date, DSCR, paths', async () => {
    await page.goto(`${dealPath}/financials`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'New Deal' }).click();
    await page.waitForURL(/\/financials\/calcs\/[0-9a-f-]{36}$/);
    const editor = page.getByRole('main');
    await expect(editor.getByText('Profit and loss')).toBeVisible();

    const pl = {
      Sales: '2000000',
      COGS: '800000',
      'Operating expenses': '400000',
      'Depreciation and amortization': '40000',
      Taxes: '0',
      Interest: '0',
      'Owner benefits': '150000',
      'Purchase price': '2500000',
      'Closing costs': '50000',
      'Working capital': '100000',
      'Required personal cash flow': '150000',
    };
    for (const [label, value] of Object.entries(pl)) {
      await labelledInput(editor, label).fill(value);
    }
    await labelledInput(editor, 'Minimum DSCR').fill('1.25');

    await selectOption(comboboxWithText(editor, 'Months from close'), 'Fiscal year');
    await editor
      .getByText('Close date', { exact: true })
      .locator('xpath=following-sibling::input')
      .fill('2027-03-31');
    await selectOption(comboboxWithText(editor, 'Month'), 'December');

    await editor.getByRole('button', { name: 'Add source' }).click();
    await editor.getByRole('button', { name: 'Add source' }).click();
    await editor.locator('input[aria-label="Amount, source 1"]').fill('2000000');
    await editor.locator('input[aria-label="Rate (%), source 1"]').fill('10.5');
    await editor.locator('input[aria-label="Term (years), source 1"]').fill('10');
    await selectOption(editor.getByRole('combobox', { name: 'Type, source 2' }), 'Seller financing');
    await editor.locator('input[aria-label="Amount, source 2"]').fill('300000');
    await editor.locator('input[aria-label="Rate (%), source 2"]').fill('6');
    await editor.locator('input[aria-label="Term (years), source 2"]').fill('10');
    await editor.locator('input[aria-label="Standby (months), source 2"]').fill('24');

    const years = editor.getByRole('heading', { name: 'Years 1-3' }).locator('xpath=..');
    await expect(years.getByRole('columnheader', { name: 'Yr 3' })).toBeVisible();
    const dscrCells = years
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'DSCR', exact: true }) })
      .getByRole('cell');
    await expect(dscrCells).toHaveCount(4);
    const debtCells = years
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'Total debt service', exact: true }) })
      .getByRole('cell');
    for (const cell of (await debtCells.allTextContents()).slice(1)) {
      expect(cell).toMatch(/^\$[\d,]+$/);
    }
    for (const cell of (await dscrCells.allTextContents()).slice(1)) {
      expect(parseFloat(cell)).toBeGreaterThan(1.25);
    }

    const pathBlock = (title: string) =>
      editor.getByRole('heading', { name: title, exact: true }).locator('xpath=..');
    for (const title of ['Worst', 'Good', 'Great']) {
      await expect(pathBlock(title).getByRole('cell', { name: 'DSCR' })).toBeVisible();
      await expect(pathBlock(title).getByTitle('Below minimum DSCR')).toHaveCount(0);
    }

    const worstLoss = editor
      .getByRole('heading', { name: 'Worst path' })
      .locator('xpath=..');
    await labelledInput(worstLoss, 'Revenue lost at close (%)').fill('40');
    await expect(
      pathBlock('Worst').getByTitle('Below minimum DSCR').first(),
    ).toBeVisible();
    await expect(pathBlock('Good').getByTitle('Below minimum DSCR')).toHaveCount(0);

    await labelledInput(worstLoss, 'Revenue lost at close (%)').fill('10');
    await expect(pathBlock('Worst').getByTitle('Below minimum DSCR')).toHaveCount(0);

    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 60 * 1000 });
    await page.goto(`${dealPath}/financials`);
    await expect(page.getByText(/DSCR \d+\.\d\dx/)).toBeVisible({
      timeout: 60 * 1000,
    });

    const calcRow = page.getByRole('row').filter({ hasText: /DSCR \d+\.\d\dx/ });
    await calcRowAction(page, calcRow, 'Mark primary');
    await expect(calcRow.getByText('Primary')).toBeVisible();
    await expect(page.getByText('No financials adopted yet')).toBeVisible();
    await calcRowAction(page, calcRow, 'Adopt');
    await expect(page.getByText('No financials adopted yet')).toHaveCount(0, {
      timeout: 30 * 1000,
    });
  });

  const sellerSide = await freshPage(browser);
  const buyerCounselSide = await freshPage(browser);
  const sellerCounselSide = await freshPage(browser);
  const sellerPage = sellerSide.page;
  const buyerCounselPage = buyerCounselSide.page;
  const sellerCounselPage = sellerCounselSide.page;
  const portal = () => `/counsel/${dealId}`;
  let roomId = '';
  let loiEditorUrl = '';
  const buyerSigner = { name: `Bianca Buyer ${stamp}`, email: team.email };
  const sellerSigner = { name: seller.name, email: seller.email };

  await test.step('3. LOI: offer, generate, counsel review, accept, real signing', async () => {
    await page.getByRole('button', { name: 'Create offer' }).click();
    const offerDialog = page.getByRole('dialog');
    await offerDialog.getByLabel('Purchase price (required)').fill('2500000');
    await offerDialog.getByLabel('Diligence (days)').fill('45');
    await offerDialog.getByLabel('Target close date').fill('2027-03-31');
    await offerDialog.getByLabel('Exclusivity (days)').fill('60');
    await offerDialog.getByRole('button', { name: 'Save version' }).click();
    await expect(offerDialog).toBeHidden();

    const offerActions = page
      .locator('div')
      .filter({ has: page.getByRole('button', { name: 'Add buyer revision' }) })
      .last();
    await offerActions.getByRole('button', { name: 'Submit' }).click();
    await expect(comboboxWithText(page, 'LOI Submitted')).toBeVisible({
      timeout: 30 * 1000,
    });
    await offerActions.getByRole('button', { name: 'Accept' }).click();
    const generateLoi = page.getByRole('button', { name: 'Generate LOI' });
    await expect(generateLoi).toBeEnabled({ timeout: 30 * 1000 });

    const ownerId = await db.userIdByEmail(team.email);
    for (const body of [
      `Offer submitted on ${firmName}`,
      `Offer accepted on ${firmName}`,
    ]) {
      await expectNotice(ownerId, body);
    }

    await generateLoi.click();
    await expect(page.getByText(/Fill in: /)).toBeVisible({ timeout: 30 * 1000 });

    await page.goto(`/home/${teamSlug}/settings`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByLabel('Legal entity name').fill(legalEntityName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(async () => {
      expect(
        (
          await db.rows<{ legal_entity_name: string | null }>(
            'accounts',
            `slug=eq.${teamSlug}&select=legal_entity_name`,
          )
        )[0]!.legal_entity_name,
      ).toBe(legalEntityName);
    }).toPass({ timeout: 30 * 1000 });

    await page.goto(`${dealPath}/financials`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'Generate LOI' }).click();
    await expect(async () => {
      await page.goto(`${dealPath}/documents`);
      await expect(card(page, 'LOI').getByRole('link', { name: 'Word' })).toBeVisible({
        timeout: 5 * 1000,
      });
    }).toPass({ timeout: 90 * 1000 });

    const wordHref = await card(page, 'LOI')
      .getByRole('link', { name: 'Word' })
      .getAttribute('href');
    const generated = wordDocumentText(
      Buffer.from(
        await (await page.request.get(new URL(wordHref!, page.url()).href)).body(),
      ),
    );
    expect(generated).not.toContain('{{');
    for (const expected of [
      '$2,500,000',
      legalEntityName,
      seller.name,
      firmName,
      'March 31, 2027',
      longDate(utcToday()),
    ]) {
      expect(generated).toContain(expected);
    }

    await page.goto(`${dealPath}/parties`);
    await counsel.inviteBuyerCounsel(page, buyerCounsel);
    await expect(card(page, 'Counsel').getByRole('status')).toHaveText(
      `Invite sent to ${buyerCounsel.email}`,
    );
    await counsel.signIn(buyerCounselPage, {
      email: buyerCounsel.email,
      dealId,
    });

    await sellerFlow.invite(page, seller);
    await expect(card(page, 'Seller room').getByRole('status')).toHaveText(
      `Invite sent to ${seller.email}`,
    );
    roomId = await sellerFlow.signIn(sellerPage, { email: seller.email });
    await counsel.inviteSellerCounsel(sellerPage, sellerCounsel);
    await expect(
      card(sellerPage, 'Your counsel').getByRole('status'),
    ).toHaveText(`Invite sent to ${sellerCounsel.email}`);
    await counsel.signIn(sellerCounselPage, {
      email: sellerCounsel.email,
      dealId,
    });

    await page.goto(`${dealPath}/documents`);
    const teamLoi = card(page, 'LOI');
    await teamLoi.getByRole('button', { name: 'Share with seller side' }).click();
    await expect(
      teamLoi.getByRole('button', { name: 'Stop sharing' }),
    ).toBeVisible();

    const reviews = [
      {
        who: 'Buyer team',
        page,
        path: `${dealPath}/documents`,
        note: `Team: price is firm at 2.5M ${stamp}`,
      },
      {
        who: "Buyer's counsel",
        page: buyerCounselPage,
        path: `${portal()}/contracts`,
        note: `Buyer counsel: tighten exclusivity ${stamp}`,
      },
      {
        who: 'Seller',
        page: sellerPage,
        path: `/seller/rooms/${roomId}/contracts`,
        note: `Seller: need a longer transition ${stamp}`,
      },
      {
        who: "Seller's counsel",
        page: sellerCounselPage,
        path: `${portal()}/contracts`,
        note: `Seller counsel: add a consulting clause ${stamp}`,
      },
    ];
    for (const review of reviews) {
      await review.page.goto(review.path);
    }
    for (const review of reviews) {
      await postComment(card(review.page, 'LOI'), review.note);
    }
    for (const review of reviews) {
      const loi = card(review.page, 'LOI');
      for (const other of reviews) {
        await expect(loi.getByText(other.note)).toBeVisible();
      }
    }

    await page.goto(dealPath);
    const timeline = card(page, 'Timeline');
    await editMilestone(timeline, 'LOI signed', { target: '2026-11-30' });
    await editMilestone(timeline, 'Financing contingency', {
      target: '2026-09-01',
    });
    await editMilestone(timeline, 'Effective date', { target: '2027-04-01' });
    await page.goto(`${dealPath}/documents`);
    await page.getByRole('button', { name: 'Apply contract dates' }).click();
    await page.getByRole('button', { name: 'Apply dates' }).click();

    await page.getByRole('button', { name: 'Send for signature' }).click();
    const request = page.getByRole('dialog', { name: 'Send for signature' });
    await request.getByLabel('Signer 1 name').fill(buyerSigner.name);
    await request.getByLabel('Signer 1 email').fill(buyerSigner.email);
    await request.getByRole('button', { name: 'Add signer' }).click();
    await request.getByLabel('Signer 2 name').fill(sellerSigner.name);
    await request.getByLabel('Signer 2 email').fill(sellerSigner.email);
    await request.getByRole('button', { name: 'Send for signature' }).click();
    await expect(request).toBeHidden({ timeout: 60 * 1000 });
    await page.goto(`${dealPath}/financials`);
    const editorLink = page.getByRole('link', {
      name: 'Open in Documenso to place signature fields',
    });
    await expect(editorLink).toBeVisible({ timeout: 60 * 1000 });
    loiEditorUrl = (await editorLink.getAttribute('href'))!;

    const sender = await openDocumensoSender(browser);
    await placeSignaturesAndSend(sender, loiEditorUrl, [
      buyerSigner.name,
      sellerSigner.name,
    ]);
    for (const signer of [buyerSigner, sellerSigner]) {
      const context = await browser.newContext({ viewport: DOCUMENSO_VIEWPORT });
      await signDocumentFromEmail(await context.newPage(), signer);
      await context.close();
    }
    await sender.context().close();

    await expect(async () => {
      await page.goto(dealPath);
      await expect(comboboxWithText(page, 'LOI Accepted')).toBeVisible({
        timeout: 3000,
      });
      await expect(
        card(page, 'Timeline').getByRole('row').filter({ hasText: 'LOI signed' }),
      ).toContainText(medium(utcToday()), { timeout: 3000 });
    }).toPass({ timeout: 120 * 1000 });
    await page.goto(`${dealPath}/documents`);
    await expect(
      card(page, 'LOI').getByRole('row').filter({ hasText: 'Signed' }),
    ).toBeVisible();
    await expectNotice(ownerId, `LOI accepted on ${firmName}`);
  });


  await test.step('4. Diligence: checklist with requested items, seller uploads', async () => {
    const [loiSigned] = await db.rows<{ actual_on: string }>(
      'deal_milestone',
      `deal_id=eq.${dealId}&kind=eq.loi_signed&select=actual_on`,
    );
    const signedOn = loiSigned!.actual_on;
    const dueDates = (title: string) =>
      db
        .rows<{ due_at: string; review_due_at: string }>(
          'checklist_item',
          `deal_id=eq.${dealId}&kind=eq.diligence&title=eq.${encodeURIComponent(title)}&select=due_at,review_due_at`,
        )
        .then(([item]) => ({
          due: item?.due_at.slice(0, 10),
          review: item?.review_due_at.slice(0, 10),
        }));

    await expect
      .poll(
        async () =>
          (
            await db.rows(
              'checklist_item',
              `deal_id=eq.${dealId}&kind=eq.diligence&select=id`,
            )
          ).length,
        { timeout: 90 * 1000 },
      )
      .toBe(23);
    expect(await dueDates('3 years business tax returns')).toEqual({
      due: addDays(signedOn, 7),
      review: addDays(signedOn, 10),
    });
    expect(await dueDates('Lender commitment letter')).toEqual({
      due: addDays(signedOn, 45),
      review: addDays(signedOn, 48),
    });

    await page.goto(`${dealPath}/diligence`);
    const checklists = card(page, 'Checklists');
    const requested = [
      '3 years business tax returns',
      '24 months bank statements',
      'Lease and landlord consent to assign',
    ];
    for (const title of requested) {
      const status = page.getByLabel(`Status of ${title}`);
      await expect(status).toBeVisible({ timeout: 30 * 1000 });
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
      await status.selectOption('requested');
      await expect(status).toHaveValue('requested', { timeout: 30 * 1000 });
    }
    await expect(checklists.getByRole('columnheader', { name: 'Due' }).first()).toBeVisible();
    await expect(
      checklists.getByRole('columnheader', { name: 'Review by' }).first(),
    ).toBeVisible();
    const taxRow = checklists
      .getByRole('row')
      .filter({ hasText: '3 years business tax returns' });
    await expect(page.getByLabel('Due date for 3 years business tax returns')).toHaveValue(
      addDays(signedOn, 7),
    );
    await expect(taxRow).toContainText(longDate(addDays(signedOn, 10)));

    const [schedule] = await db.rows<{ id: string; start_date: string }>(
      'diligence_schedule',
      `deal_id=eq.${dealId}&select=id,start_date`,
    );
    expect(schedule!.start_date).toBe(signedOn);
    expect(
      await db.rows(
        'schedule_week',
        `schedule_id=eq.${schedule!.id}&select=week_no&order=week_no`,
      ),
    ).toHaveLength(6);
    const [apaTarget] = await db.rows<{ target_on: string }>(
      'deal_milestone',
      `deal_id=eq.${dealId}&kind=eq.apa_signing&select=target_on`,
    );
    expect(apaTarget!.target_on).toBe(addDays(signedOn, 45));
    await page.goto(`${dealPath}/schedule`);
    await expect(page.getByText('No diligence schedule')).toHaveCount(0);
    await expect(
      page.getByRole('row').filter({ has: page.getByRole('cell', { name: /^[1-6]$/ }) }),
    ).toHaveCount(6);

    const sellerFiles = ['financials', 'customers', 'leases', 'payroll'].map(
      (topic) => ({
        name: `seller-${topic}-${stamp}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(`Seller ${topic} data ${stamp}`),
      }),
    );
    await sellerPage.goto(`/seller/rooms/${roomId}`);
    await sellerPage
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('button', { name: 'Uploads' })
      .click();
    await sellerPage
      .getByLabel('Add files', { exact: true })
      .setInputFiles(sellerFiles);
    for (const file of sellerFiles) {
      await expect(
        sellerPage.getByRole('button', { name: file.name, exact: true }),
      ).toBeVisible({ timeout: 30 * 1000 });
    }
    const sellerUserId = await db.userIdByEmail(seller.email);
    expect(
      (
        await db.rows<{ name: string }>(
          'dr_document',
          `deal_id=eq.${dealId}&uploaded_by=eq.${sellerUserId}&select=name`,
        )
      )
        .map((row) => row.name)
        .sort(),
    ).toEqual(sellerFiles.map((file) => file.name).sort());
  });

  const lenderCount = 12;
  const lenders = Array.from({ length: lenderCount }, (_, index) => ({
    email: newCredentials().email,
    name: `Lender ${index + 1} ${stamp}`,
    room: `Lending Co ${index + 1} ${stamp}`,
    domain: `lender${index + 1}-${stamp}.test`,
    roomId: '',
    page: undefined as unknown as Page,
  }));
  const lendersPath = `${dealPath}/lenders`;
  const packageFiles = ['form-1919', 'tax-transcripts', 'debt-schedule'].map(
    (topic) => ({
      name: `sba-${topic}-${stamp}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`SBA package ${topic} ${stamp}`),
    }),
  );

  await test.step('5. Lenders: 12 rooms, SBA package, questions, FAQ, selection', async () => {
    await page.goto(lendersPath);
    await page.getByRole('button', { name: 'Start the lender package' }).click();
    await page.getByLabel('Add files', { exact: true }).setInputFiles(packageFiles);
    for (const file of packageFiles) {
      await expect(
        page.getByRole('link', { name: `Download ${file.name}` }),
      ).toBeVisible({ timeout: 30 * 1000 });
    }

    const savedPath = `/home/${teamSlug}/lenders/saved`;
    await page.goto(savedPath);
    for (const [index, lender] of lenders.entries()) {
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
      await page.getByRole('button', { name: 'Add lender' }).click();
      const form = page.getByRole('dialog', { name: 'Add a lender' });
      await form.getByLabel('Lender name').fill(lender.room);
      await form.getByLabel('Website').fill(lender.domain);
      await form.getByLabel('Typical rate (%)').fill('10.5');
      await form.getByLabel('Largest loan ($)').fill(String(500000 + index * 250000));
      if (index < 8) {
        await form.getByLabel('Prefers SBA loans').check();
      }
      await form
        .getByLabel('Industries')
        .fill(index < 4 ? 'Plumbing' : index < 8 ? 'Dental' : '');
      await form.getByLabel('States').fill(index % 2 === 0 ? 'TX' : '');
      await form.getByLabel('Tags').fill(index < 8 ? 'sba' : 'conventional');
      await form.getByRole('button', { name: 'Save lender' }).click();
      await expect(form).toBeHidden({ timeout: 60 * 1000 });

      const saved = page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: lender.room, exact: true }) })
        .first();
      await expect(saved).toBeVisible({ timeout: 60 * 1000 });
      await saved.getByRole('button', { name: `Add contact to ${lender.room}` }).click();
      const contact = page.getByRole('dialog', {
        name: `Add a contact at ${lender.room}`,
      });
      await contact.getByLabel('Contact name').fill(lender.name);
      await contact.getByLabel('Email').fill(lender.email);
      await contact.getByRole('button', { name: 'Save contact' }).click();
      await expect(contact).toBeHidden({ timeout: 60 * 1000 });
      await expect(saved.getByText(lender.email)).toBeVisible({ timeout: 60 * 1000 });
      await saved.getByRole('button', { name: `Make ${lender.name} primary` }).click();
      await expect(saved.getByText('Primary', { exact: true })).toBeVisible({
        timeout: 60 * 1000,
      });
    }

    const shownLenders = page
      .getByRole('list', { name: 'Saved lenders' })
      .getByRole('heading', { level: 3 });
    await expect(shownLenders).toHaveCount(12);
    const chip = (name: string) =>
      page.getByRole('button', { name, exact: true });
    await chip('sba').click();
    await expect(shownLenders).toHaveCount(8);
    await chip('sba').click();
    await chip('conventional').click();
    await expect(shownLenders).toHaveCount(4);
    await chip('conventional').click();
    await chip('Plumbing').click();
    await expect(shownLenders).toHaveCount(8);
    await chip('Plumbing').click();
    await page.getByLabel('Loan size ($)').fill('2000000');
    await expect(shownLenders).toHaveCount(6);
    await page.getByLabel('Only lenders that prefer SBA').check();
    await expect(shownLenders).toHaveCount(2);
    await page.getByLabel('Only lenders that prefer SBA').uncheck();
    await page.getByLabel('Loan size ($)').fill('');
    await expect(shownLenders).toHaveCount(12);

    await page.goto(`/home/${teamSlug}/settings/lenders`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByLabel('Days quiet before a nudge').fill('7');
    await page.getByRole('button', { name: 'Save quiet days' }).click();
    await expect(async () => {
      await page.reload();
      await expect(page.getByLabel('Days quiet before a nudge')).toHaveValue('7', {
        timeout: 3000,
      });
    }).toPass({ timeout: 30 * 1000 });

    await page.goto(lendersPath);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByLabel('Must close by').fill('2027-03-31');
    await page.getByLabel('Why that date').fill(`The seller retires in March ${stamp}`);
    await page.getByRole('button', { name: 'Save deadline' }).click();
    await page.getByLabel('Loan amount ($)').fill('2000000');
    await page.getByLabel('Term (years)').fill('10');
    await page.getByLabel('Seller note ($)').fill('300000');
    await page.getByRole('button', { name: 'Save terms' }).click();
    await expect(async () => {
      await page.reload();
      await expect(page.getByLabel('Must close by')).toHaveValue('2027-03-31', {
        timeout: 3000,
      });
      await expect(page.getByLabel('Loan amount ($)')).toHaveValue('2,000,000', {
        timeout: 3000,
      });
    }).toPass({ timeout: 60 * 1000 });

    for (const lender of lenders) {
      cleanup.track({ kind: 'user', email: lender.email });
      await page
        .getByRole('checkbox', { name: new RegExp(lender.room) })
        .check();
    }
    await page.getByRole('button', { name: 'Set up 12 rooms' }).click();
    const rooms = () =>
      db.rows<{ id: string; name: string }>(
        'lender_room',
        `deal_id=eq.${dealId}&select=id,name`,
      );
    await expect
      .poll(async () => (await rooms()).length, { timeout: 120 * 1000 })
      .toBe(12);
    for (const room of await rooms()) {
      lenders.find((lender) => lender.room === room.name)!.roomId = room.id;
    }
    expect(lenders.every((lender) => lender.roomId !== '')).toBe(true);

    await expect(
      page.getByText('Rooms set up, but these contacts got no email'),
    ).toHaveCount(0);

    const [accountRow] = await db.rows<{ id: string }>(
      'accounts',
      `slug=eq.${teamSlug}&select=id`,
    );
    await db.insert('mailbox_connection', {
      account_id: accountRow!.id,
      user_id: await db.userIdByEmail(team.email),
      provider: 'gmail',
      nango_connection_id: `e2e-mailbox-${stamp}`,
      provider_config_key: 'google-mail',
      email_address: team.email,
      status: 'active',
    });

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'Draft outreach' }).click();
    await expect(page.getByRole('button', { name: /^Send to / })).toHaveCount(12, {
      timeout: 60 * 1000,
    });
    const sentSubjects = new Map<string, string>();
    for (const lender of lenders) {
      const subject = await page
        .locator(`#outreach-subject-${lender.roomId}`)
        .inputValue();
      sentSubjects.set(lender.email, subject);
      await page.getByRole('button', { name: `Send to ${lender.room}` }).click();
      await expect(page.getByText(`Sent to ${lender.email}`)).toBeVisible({
        timeout: 60 * 1000,
      });
    }
    const delivered = await gmail.sent();
    for (const lender of lenders) {
      const message = delivered.find((sent) =>
        sent.mime.includes(`To: ${lender.email}`),
      );
      expect(message, `a Gmail message to ${lender.email}`).toBeDefined();
      expect(message!.mime).toContain(`Subject: ${sentSubjects.get(lender.email)}`);
    }

    const askers = lenders.slice(0, 4);
    const questions = [
      'How seasonal is the revenue?',
      'What is the equipment worth as collateral?',
      'Who runs the business after the owner leaves?',
      'Which insurance limits are in force?',
    ];
    await page.request.get(`/lender/${lenders[0]!.roomId}`);
    await page.request.get(`/lender/${lenders[0]!.roomId}/requests`);
    const LENDER_CONCURRENCY = 4;
    const signInLender = async (lender: (typeof lenders)[number], index: number) => {
        const side = await freshPage(browser);
        lender.page = side.page;
        await lenderFlow.signIn(lender.page, {
          email: lender.email,
          roomId: lender.roomId,
        });
        await expect(
          lender.page.getByText(`Prepared for ${lender.room}`),
        ).toBeVisible({ timeout: 90 * 1000 });
        for (const file of packageFiles) {
          const downloading = lender.page.waitForEvent('download', {
            timeout: 60 * 1000,
          });
          await lender.page
            .getByRole('link', { name: `Download ${file.name}` })
            .click();
          expect((await downloading).suggestedFilename()).toBe(file.name);
        }
        const timelineChoices = ['Yes', 'Need to talk', 'No'];
        if (index < timelineChoices.length) {
          await expect(
            lender.page.getByRole('heading', { name: 'Can you close by March 31, 2027?' }),
          ).toBeVisible({ timeout: 60 * 1000 });
          const choice = lender.page.getByRole('button', {
            name: timelineChoices[index]!,
            exact: true,
          });
          await expect(async () => {
            await choice.click();
            await expect(choice).toHaveAttribute('aria-pressed', 'true', {
              timeout: 5000,
            });
          }).toPass({ timeout: 60 * 1000 });
        }
        if (index < askers.length) {
          const composer = lender.page.getByRole('dialog', {
            name: 'Request something',
          });
          await lender.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
          await expect(async () => {
            await lender.page
              .getByRole('button', { name: 'Request something' })
              .click();
            await expect(composer).toBeVisible({ timeout: 5000 });
          }).toPass({ timeout: 60 * 1000 });
          await composer
            .getByRole('textbox', { name: /What do you need from/ })
            .fill(questions[index]!);
          await composer.getByRole('button', { name: 'Send request' }).click();
          await expect(composer).toBeHidden({ timeout: 60 * 1000 });
        }
    };
    for (let start = 0; start < lenders.length; start += LENDER_CONCURRENCY) {
      await Promise.all(
        lenders
          .slice(start, start + LENDER_CONCURRENCY)
          .map((lender, offset) => signInLender(lender, start + offset)),
      );
    }

    const answers = [
      'Revenue peaks in the summer months.',
      'An independent appraisal values it at 400 thousand dollars.',
      'The seller trains the buyer for six months.',
      'General liability is 2 million dollars per claim.',
    ];
    for (const [index, lender] of askers.entries()) {
      await page.goto(`${lendersPath}/${lender.roomId}?tab=requests`);
      await page.getByRole('link', { name: questions[index]! }).click();
      const replyBox = page.getByLabel('Reply', { exact: true });
      await replyBox.fill(answers[index]!);
      await page.getByRole('button', { name: 'Send reply' }).click();
      await expect(replyBox).toHaveValue('');
      await expect(page.getByText(answers[index]!)).toBeVisible();

      if (index < 3) {
        await page.getByRole('button', { name: 'Add to FAQ' }).click();
        const faq = page.getByRole('dialog', { name: 'Add to the FAQ' });
        await faq.getByRole('button', { name: 'Publish' }).click();
        await expect(page.getByText('Published to the FAQ.').first()).toBeVisible();
        await expect(
          faq.getByText('The FAQ already has entries like this one'),
        ).toHaveCount(0);
      }
    }

    for (const lender of lenders) {
      await lender.page.goto(`/lender/${lender.roomId}/faq`);
      for (const [index, question] of questions.entries()) {
        const entry = lender.page.getByText(question);
        if (index < 3) {
          await expect(entry.first()).toBeVisible();
        } else {
          await expect(entry).toHaveCount(0);
        }
      }
    }

    await page.goto(lendersPath);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    const answerFor = (lender: (typeof lenders)[number]) =>
      page
        .getByRole('listitem')
        .filter({ hasText: lender.room })
        .filter({ hasText: 'Record by hand' });
    await expect(answerFor(lenders[0]!)).toContainText('Yes, from the lender', {
      timeout: 30 * 1000,
    });
    await expect(answerFor(lenders[1]!)).toContainText('Need to talk, from the lender');
    await expect(answerFor(lenders[2]!)).toContainText('No, from the lender');
    await page
      .getByRole('button', { name: `Record yes for ${lenders[3]!.room}` })
      .click();
    await expect(answerFor(lenders[3]!)).toContainText('Yes, recorded by us', {
      timeout: 30 * 1000,
    });

    await page.goto(`/home/${teamSlug}/lenders/saved`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await expect(
      page.getByRole('heading', { name: 'Lenders to nudge' }),
    ).toBeVisible();
    await expect(page.getByText('No lender has gone quiet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draft nudges' })).toHaveCount(0);

    for (const [index, lender] of lenders.entries()) {
      await page.goto(`${lendersPath}/${lender.roomId}?tab=settings`);
      await page.getByRole('tab', { name: 'Status and access' }).click();
      const status = index === 0 ? 'Selected' : 'Declined';
      await page.getByRole('button', { name: status, exact: true }).click();
      await expect(
        page.getByRole('button', { name: status, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
    }
  });


  const apaEditorLinks = () =>
    page.getByRole('link', { name: 'Open in Documenso to place signature fields' });

  await test.step('6. APA: generate, 10 redline rounds, real signing', async () => {
    await page.goto(`${dealPath}/financials`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await Promise.all([
      page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().includes('/financials'),
      ),
      page.getByRole('button', { name: 'Generate APA' }).click(),
    ]);
    await page.goto(`${dealPath}/documents`);
    await expect(async () => {
      await page.goto(`${dealPath}/documents`);
      await expect(card(page, 'APA').getByRole('link', { name: 'Word' })).toBeVisible({
        timeout: 5 * 1000,
      });
    }).toPass({ timeout: 90 * 1000 });
    const apaWordHref = await card(page, 'APA')
      .getByRole('link', { name: 'Word' })
      .getAttribute('href');
    const apaText = wordDocumentText(
      Buffer.from(
        await (
          await page.request.get(new URL(apaWordHref!, page.url()).href)
        ).body(),
      ),
    );
    expect(apaText).not.toContain('{{');
    for (const expected of ['$2,500,000', legalEntityName, seller.name, firmName]) {
      expect(apaText).toContain(expected);
    }

    const teamApa = card(page, 'APA');
    await teamApa.getByRole('button', { name: 'Share with seller side' }).click();
    await expect(teamApa.getByRole('button', { name: 'Stop sharing' })).toBeVisible();

    const rounds = 10;
    for (let round = 1; round <= rounds; round++) {
      const side = round % 2 === 1 ? 'buyer' : 'seller';
      const counselPage = side === 'buyer' ? buyerCounselPage : sellerCounselPage;
      const summary = `APA round ${round} ${side} redline ${stamp}`;

      const apa = card(counselPage, 'APA');
      await expect(async () => {
        await counselPage.goto(`${portal()}/contracts`);
        await expect(apa.locator('input[type=file]')).toBeAttached({
          timeout: 5000,
        });
      }).toPass({ timeout: 90 * 1000 });
      await apa.locator('input[type=file]').setInputFiles({
        name: `apa-round-${round}.docx`,
        mimeType: DOCX_CONTENT_TYPE,
        buffer: wordDocument([
          'Asset Purchase Agreement',
          `Round ${round}, marked up by the ${side}'s counsel`,
          `Section ${(round % 12) + 1}: the purchase price adjustment is ${1000 + round * 25} dollars`,
          `Indemnity cap changes to ${round % 7 + 3} percent of the price`,
        ]),
      });
      await apa.getByLabel('What changed (optional)').fill(summary);
      await apa.getByRole('button', { name: 'Upload redline' }).click();
      await expect(apa.getByRole('row').filter({ hasText: summary })).toBeVisible({
        timeout: 60 * 1000,
      });
      await postComment(
        apa.locator('[data-version-comments]').last(),
        `Round ${round} note from the ${side}'s counsel ${stamp}`,
      );

      if (round % 10 === 0) {
        await expect(async () => {
          await page.goto(`${dealPath}/documents`);
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
          await card(page, 'APA')
            .getByRole('row')
            .filter({ hasText: summary })
            .getByRole('button', { name: 'Make current' })
            .click();
          await expect
            .poll(
              async () =>
                (
                  await db.rows<{ current_version: number }>(
                    'contract',
                    `deal_id=eq.${dealId}&type=eq.apa&select=current_version`,
                  )
                )[0]!.current_version,
              { timeout: 10 * 1000 },
            )
            .toBe(round + 1);
        }).toPass({ timeout: 90 * 1000 });
        await page.reload();
        await expect(
          card(page, 'APA').getByRole('row').filter({ hasText: summary }),
        ).toContainText('Current');
      }
    }

    const [apaContract] = await db.rows<{ id: string; current_version: number }>(
      'contract',
      `deal_id=eq.${dealId}&type=eq.apa&select=id,current_version`,
    );
    const versions = await db.rows<{ version: number }>(
      'contract_version',
      `contract_id=eq.${apaContract!.id}&select=version`,
    );
    expect(versions).toHaveLength(rounds + 1);
    expect(apaContract!.current_version).toBe(rounds + 1);

    const finalVersion = rounds + 1;
    const [{ seller_number: finalSellerNumber }] = await db.rows<{
      seller_number: number;
    }>(
      'contract_version',
      `contract_id=eq.${apaContract!.id}&version=eq.${finalVersion}&select=seller_number`,
    ) as [{ seller_number: number }];
    const finalReview = (on: Page, number: number) =>
      card(on, 'APA')
        .locator('[data-version-review]')
        .filter({ hasText: `on version ${number}` });

    await page.goto(`${dealPath}/documents`);
    await finalReview(page, finalVersion)
      .getByRole('button', { name: 'Ask counsel to review' })
      .click();
    for (const [counselPage, number] of [
      [buyerCounselPage, finalVersion],
      [sellerCounselPage, finalSellerNumber],
    ] as const) {
      await expect(async () => {
        await counselPage.goto(`${portal()}/contracts`);
        await counselPage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
        const section = finalReview(counselPage, number);
        await section
          .getByRole('button', { name: 'Approve', exact: true })
          .click({ timeout: 5000 });
        await expect(section).toContainText('Approved on', {
          timeout: 10 * 1000,
        });
      }).toPass({ timeout: 90 * 1000 });
    }

    await page.goto(`${dealPath}/documents`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    const request = page.getByRole('dialog', { name: 'Send for signature' });
    await expect(async () => {
      await finalReview(page, finalVersion)
        .getByRole('button', { name: 'Send for signature' })
        .click({ timeout: 5000 });
      await expect(request).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60 * 1000 });
    await request.getByLabel('Signer 1 name').fill(buyerSigner.name);
    await request.getByLabel('Signer 1 email').fill(buyerSigner.email);
    await request.getByRole('button', { name: 'Add signer' }).click();
    await request.getByLabel('Signer 2 name').fill(sellerSigner.name);
    await request.getByLabel('Signer 2 email').fill(sellerSigner.email);
    await request.getByRole('button', { name: 'Send for signature' }).click();
    await expect(request).toBeHidden({ timeout: 60 * 1000 });
    await page.goto(`${dealPath}/financials`);
    await expect(apaEditorLinks()).toHaveCount(1, { timeout: 60 * 1000 });
    const apaEditorUrl = (await apaEditorLinks().getAttribute('href'))!;

    const sender = await openDocumensoSender(browser);
    await placeSignaturesAndSend(sender, apaEditorUrl, [
      buyerSigner.name,
      sellerSigner.name,
    ]);
    for (const signer of [buyerSigner, sellerSigner]) {
      const context = await browser.newContext({ viewport: DOCUMENSO_VIEWPORT });
      await signDocumentFromEmail(await context.newPage(), signer);
      await context.close();
    }
    await sender.context().close();

    const signedVersion = () =>
      db.rows<{ seller_number: number }>(
        'contract_version',
        `contract_id=eq.${apaContract!.id}&is_signed=eq.true&select=seller_number`,
      );
    await expect
      .poll(async () => (await signedVersion()).length, { timeout: 120 * 1000 })
      .toBe(1);
    const [signed] = await signedVersion();

    await expect(async () => {
      await page.goto(dealPath);
      await expect(comboboxWithText(page, 'PA Accepted')).toBeVisible({
        timeout: 3000,
      });
      const timeline = card(page, 'Timeline');
      await expect(
        timeline.getByRole('row').filter({ hasText: 'APA signing' }),
      ).toContainText(medium(utcToday()), { timeout: 3000 });
      await expect(
        timeline
          .getByRole('row')
          .filter({ hasText: `APA v${signed!.seller_number} signed` }),
      ).toContainText(medium(utcToday()), { timeout: 3000 });
    }).toPass({ timeout: 120 * 1000 });
    await expectNotice(
      await db.userIdByEmail(team.email),
      `APA accepted on ${firmName}`,
    );
  });

  await test.step('7. Closing: dates, integration, update, post-close, close rooms', async () => {
    await page.goto(dealPath);
    const timeline = card(page, 'Timeline');
    const checklists = card(page, 'Checklists');
    const itemDates = (title: string, kind: string) =>
      db
        .rows<{ due_at: string; review_due_at: string }>(
          'checklist_item',
          `deal_id=eq.${dealId}&kind=eq.${kind}&title=eq.${encodeURIComponent(title)}&select=due_at,review_due_at`,
        )
        .then(([item]) => ({
          due: item?.due_at.slice(0, 10),
          review: item?.review_due_at.slice(0, 10),
        }));

    await page.goto(`${dealPath}/diligence`);
    await selectOption(checklists.getByRole('combobox').first(), 'Standard Closing');
    await checklists.getByRole('button', { name: 'Apply template' }).click();
    await expect
      .poll(
        async () =>
          (
            await db.rows(
              'checklist_item',
              `deal_id=eq.${dealId}&kind=eq.closing&select=id`,
            )
          ).length,
        { timeout: 60 * 1000 },
      )
      .toBe(13);
    expect(await itemDates('APA final and signed', 'closing')).toEqual({
      due: '2027-03-17',
      review: '2027-03-20',
    });
    expect(await itemDates('SBA loan authorization received', 'closing')).toEqual({
      due: '2027-03-10',
      review: '2027-03-13',
    });
    expect(await itemDates('Funds flow confirmed and wired', 'closing')).toEqual({
      due: '2027-03-31',
      review: '2027-04-03',
    });

    await page.goto(dealPath);
    await editMilestone(timeline, 'Closing', { target: '2027-04-14' });
    await expect
      .poll(() => itemDates('APA final and signed', 'closing'), {
        timeout: 60 * 1000,
      })
      .toEqual({ due: '2027-03-31', review: '2027-04-03' });
    expect(await itemDates('Funds flow confirmed and wired', 'closing')).toEqual({
      due: '2027-04-14',
      review: '2027-04-17',
    });

    await page.reload();
    await expect(
      card(page, 'Timeline').getByRole('row').filter({ hasText: 'Closing' }),
    ).toContainText('Apr 14, 2027');
    await editMilestone(card(page, 'Timeline'), 'Closing', { actual: utcToday() });
    await editMilestone(timeline, 'Effective date', { actual: utcToday() });
    await selectOption(comboboxWithText(page, 'PA Accepted'), 'Integration');
    await expect(comboboxWithText(page, 'Integration')).toBeVisible({
      timeout: 30 * 1000,
    });

    const sharedNames = ['LOI signed', 'APA signing', 'Closing', 'Effective date'];
    const teamOnlyNames = ['Diligence end', 'Financing contingency', 'LOI deadline'];
    const lenderToCheck = lenders[1]!;
    for (const outsider of [
      { page: lenderToCheck.page, path: `/lender/${lenderToCheck.roomId}` },
      { page: sellerPage, path: `/seller/rooms/${roomId}` },
    ]) {
      await outsider.page.goto(outsider.path);
      const rows = outsider.page.getByRole('row');
      for (const name of sharedNames) {
        await expect(rows.filter({ hasText: name })).toHaveCount(1);
      }
      for (const name of teamOnlyNames) {
        await expect(rows.filter({ hasText: name })).toHaveCount(0);
      }
      await expect(outsider.page.getByText(/APA v\d+ signed/)).toHaveCount(0);
    }

    const approverSide = await freshPage(browser);
    const approverPage = approverSide.page;
    await auth.signUp(approverPage, secondAdmin);
    const [teamAccount] = await db.rows<{ id: string }>(
      'accounts',
      `slug=eq.${teamSlug}&select=id`,
    );
    await db.insert('accounts_memberships', {
      account_id: teamAccount!.id,
      user_id: await db.userIdByEmail(secondAdmin.email),
      account_role: 'admin',
    });
    await completeInviteeOnboarding(approverPage, teamSlug);

    const updateSubject = `We closed on the business ${stamp}`;
    const updateBody = `Closing happened and the integration begins ${stamp}`;
    const updates = card(page, 'Updates');
    await updates.getByLabel('Update subject').fill(updateSubject);
    await updates.getByLabel('Update body').fill(updateBody);
    for (const group of ['Lenders', 'Sellers', "Buyer's counsel", "Seller's counsel"]) {
      await updates.getByLabel(`Send to ${group}`).check();
    }
    await updates.getByRole('button', { name: 'Save draft' }).click();
    await updates.getByRole('button', { name: `Submit ${updateSubject}` }).click();
    await expect(
      updates.getByRole('button', { name: `Submit ${updateSubject}` }),
    ).toHaveCount(0);
    await expect(
      updates.getByRole('button', { name: `Approve ${updateSubject}` }),
    ).toHaveCount(0);

    await approverPage.goto(dealPath);
    const approverUpdates = card(approverPage, 'Updates');
    const recipients = approverUpdates.getByRole('list', {
      name: `Recipients of ${updateSubject}`,
    });
    for (const email of [
      seller.email,
      buyerCounsel.email,
      sellerCounsel.email,
      lenders[0]!.email,
    ]) {
      await expect(recipients).toContainText(email);
    }
    await expect(recipients).not.toContainText(lenders[1]!.email);
    await approverPage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await approverUpdates
      .getByRole('button', { name: `Approve ${updateSubject}` })
      .click();
    await expect(async () => {
      await approverPage.reload();
      await expect(
        card(approverPage, 'Updates').getByRole('list', {
          name: `Delivery of ${updateSubject}`,
        }),
      ).toContainText(seller.email, { timeout: 3000 });
    }).toPass({ timeout: 120 * 1000 });

    for (const to of [
      lenders[0]!.email,
      seller.email,
      buyerCounsel.email,
      sellerCounsel.email,
    ]) {
      const delivered = await waitForMessage({
        to,
        subject: new RegExp(updateSubject),
        timeout: 90 * 1000,
      });
      expect(delivered.text).toContain(updateBody);
    }
    await approverSide.context.close();

    await page.goto(`${dealPath}/diligence`);
    await selectOption(
      card(page, 'Checklists').getByRole('combobox').first(),
      'Day 0 Takeover',
    );
    await card(page, 'Checklists')
      .getByRole('button', { name: 'Apply template' })
      .click();
    const postClose = () =>
      db.rows<{ title: string; due_at: string; review_due_at: string }>(
        'checklist_item',
        `deal_id=eq.${dealId}&kind=eq.post_close&select=title,due_at,review_due_at`,
      );
    await expect
      .poll(async () => (await postClose()).length, { timeout: 60 * 1000 })
      .toBe(23);
    for (const item of await postClose()) {
      expect(item.due_at.slice(0, 10)).toBe(utcToday());
      expect(item.review_due_at.slice(0, 10)).toBe(addDays(utcToday(), 3));
    }
    const postCloseCard = card(page, 'Checklists');
    for (const { title } of await postClose()) {
      const status = page.getByLabel(`Status of ${title}`);
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
      await status.selectOption('clean');
      await expect(status).toHaveValue('clean', { timeout: 30 * 1000 });
    }

    // The update went out before any close was tried, and an update only
    // counts when it is sent after the first close attempt, so every room
    // must go through its closing to-do.
    for (const lender of lenders) {
      const roomSettings = `${lendersPath}/${lender.roomId}?tab=settings`;
      const openCloseControl = async () => {
        await page.goto(roomSettings);
        await page.getByRole('tab', { name: 'Status and access' }).click();
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
        await page.getByRole('button', { name: 'Close room' }).click();
      };
      await openCloseControl();
      await expect(
        page.getByText(`Tick "Tell ${lender.room} the room is closing"`, {
          exact: false,
        }),
      ).toBeVisible({ timeout: 30 * 1000 });
      await page.goto(`${dealPath}/todos`);
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
      const todo = page
        .getByRole('listitem')
        .filter({ hasText: `Tell ${lender.room} the room is closing` })
        .getByRole('checkbox');
      await todo.click();
      await expect(todo).toBeChecked({ timeout: 30 * 1000 });
      await openCloseControl();
      await page.getByRole('button', { name: 'Close this room' }).click();
      await expect(page.getByRole('button', { name: 'Reopen room' })).toBeVisible({
        timeout: 60 * 1000,
      });
    }

    await page.goto(`${dealPath}/parties`);
    const sellerRoom = card(page, 'Seller room');
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await sellerRoom.getByRole('button', { name: 'Close room' }).click();
    await expect
      .poll(
        async () =>
          (
            await db.rows(
              'personal_todo',
              `deal_id=eq.${dealId}&done=eq.false&title=like.*the room is closing*`,
            )
          ).length,
        { timeout: 30 * 1000 },
      )
      .toBe(1);
    await page.goto(`${dealPath}/todos`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    const sellerTodo = page
      .getByRole('listitem')
      .filter({ hasText: /the room is closing/ })
      .getByRole('checkbox', { checked: false });
    await expect(sellerTodo).toHaveCount(1);
    await sellerTodo.click();
    await expect(page.getByRole('checkbox', { checked: false })).toHaveCount(0, {
      timeout: 30 * 1000,
    });
    await page.goto(`${dealPath}/parties`);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await sellerRoom.getByRole('button', { name: 'Close room' }).click();
    await page
      .getByRole('dialog', { name: 'Close the seller room?' })
      .getByRole('button', { name: 'Close this room' })
      .click();
    await expect(
      sellerRoom.getByRole('button', { name: 'Reopen room' }),
    ).toBeVisible();
  });

  await test.step('8. Missed date: overdue notice for the owner', async () => {
    await run('docker', [
      'exec',
      'opendealbook-temporal-1',
      'temporal',
      'schedule',
      'trigger',
      '--address',
      'temporal:7233',
      '--schedule-id',
      'milestone-overdue-notice',
    ]);
    const ownerId = await db.userIdByEmail(team.email);
    const notice = await db.waitForRow<{ body: string }>(
      'notifications',
      `recipient_user_id=eq.${ownerId}&body=like.${encodeURIComponent(`Financing contingency on ${firmName}*`)}`,
      { timeout: 90 * 1000 },
    );
    expect(notice.body).toBe(
      `Financing contingency on ${firmName} was due ${medium('2026-09-01')} and has no actual date.`,
    );

    await page.goto(dealPath);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.locator('button:has(svg.lucide-bell)').click();
    await expect(page.getByText(notice.body)).toBeVisible();

    await page.goto(dealPath);
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'Mark won' }).click();
    await expect(page.getByText('Won (closed)').first()).toBeVisible({
      timeout: 30 * 1000,
    });
    await expectNotice(ownerId, `${firmName} closed`);
  });

  await test.step('9. Timeline: targets, actuals, history, outside parties', async () => {
    await page.goto(dealPath);
    const timeline = card(page, 'Timeline');
    const row = (name: string | RegExp) =>
      timeline.getByRole('row').filter({ hasText: name });
    const today = medium(utcToday());
    const [accepted] = await db.rows<{ created_at: string }>(
      'deal_event',
      `deal_id=eq.${dealId}&event_type=eq.offer.accepted&select=created_at`,
    );
    const diligenceEnd = new Date(accepted!.created_at);
    diligenceEnd.setUTCDate(diligenceEnd.getUTCDate() + 45);

    await expect(row('LOI signed')).toContainText(medium('2026-11-30'));
    await expect(row('LOI signed')).toContainText(today);
    await expect(row('Diligence end')).toContainText(
      medium(diligenceEnd.toISOString().slice(0, 10)),
    );
    await expect(row('Financing contingency')).toContainText(medium('2026-09-01'));
    await expect(row('Financing contingency')).toContainText('Overdue');
    await expect(row('Financing contingency')).toContainText('Not set');
    const [signedOn] = await db.rows<{ actual_on: string }>(
      'deal_milestone',
      `deal_id=eq.${dealId}&kind=eq.loi_signed&select=actual_on`,
    );
    await expect(row('APA signing')).toContainText(
      medium(addDays(signedOn!.actual_on, 45)),
    );
    await expect(row('APA signing')).toContainText(today);
    await expect(row('Closing')).toContainText(medium('2027-04-14'));
    await expect(row('Closing')).toContainText(today);
    await expect(row('Effective date')).toContainText(medium('2027-04-01'));
    await expect(row('Effective date')).toContainText(today);
    await expect(row(/APA v\d+ signed/)).toContainText(today);

    const history = timeline.locator('[data-timeline-change]');
    await expect(
      history.filter({ hasText: 'LOI signed set' }).filter({ hasText: 'System via Documenso' }),
    ).not.toHaveCount(0);
    await expect(
      history.filter({ hasText: 'APA signing set' }).filter({ hasText: 'System via Documenso' }),
    ).not.toHaveCount(0);
    await expect(
      history.filter({ hasText: 'Closing set' }).filter({ hasText: 'Playwright Owner' }),
    ).not.toHaveCount(0);
    await expect(history.first()).toContainText(/\d{1,2}:\d{2}/);

    const secondTeam = `Second Crew ${stamp}`;
    await page.goto('/home/create-team');
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    await page.getByLabel('Team name').fill(secondTeam);
    await page.getByRole('button', { name: 'Create team' }).click();
    const { slug: secondSlug } = await db.waitForRow<{ slug: string }>(
      'accounts',
      `name=eq.${encodeURIComponent(secondTeam)}&select=slug`,
    );
    await page.goto(`/home/${secondSlug}`);
    await page.goto('/home');
    await expect(page).toHaveURL(new RegExp(`/home/${secondSlug}(/|$)`));
    await page.goto(`/home/${teamSlug}`);
    await page.goto('/home');
    await expect(page).toHaveURL(new RegExp(`/home/${teamSlug}(/|$)`));
  });

});
