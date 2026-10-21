import type { Locator, Page } from '@playwright/test';

import { completeTeamOnboarding, db, expect, test } from './fixtures';
import { calcRowAction } from './fixtures/calc';
import { createDeal } from './fixtures/deal';

async function selectOption(combobox: Locator, optionName: string) {
  const page = combobox.page();
  await combobox.click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

// shadcn SelectTrigger exposes no accessible name; its current value is a child
// text node, so comboboxes are matched by contained text rather than by name.
function comboboxWithText(scope: Page | Locator, text: string) {
  return scope.getByRole('combobox').filter({ hasText: text });
}

function sdeRow(page: Page, lineLabel: string) {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: lineLabel, exact: true }) });
}

function contractsForDeal(dealId: string) {
  return db.rows<{ id: string; type: string; status: string }>(
    'contract',
    `deal_id=eq.${dealId}&select=id,type,status`,
  );
}

test('full deal flow: onboard, create, advance, offer, calc, checklist, resolve, list', async ({
  page,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  await auth.signUp(page);
  const slug = await completeTeamOnboarding(page, `Deal Flow Team ${Date.now()}`, {
    name: 'Playwright Buyer',
  });
  await expect(page).toHaveURL(new RegExp(`/home/${slug}(/|$)`));

  await page.goto(`/home/${slug}/deals`);
  await expect(page.getByRole('heading', { name: 'Deals' })).toBeVisible();
  const examplesFilter = page.getByRole('checkbox', { name: /^Examples \(4\)$/ });
  await expect(examplesFilter).toBeVisible();
  await expect(page.getByText('Example', { exact: true })).toHaveCount(0);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await examplesFilter.click();
  await expect(examplesFilter).toBeChecked();
  await expect(page.getByText('Example', { exact: true })).toHaveCount(4);
  await expect(
    page
      .getByText('[Example] Riverline Logistics')
      .first(),
  ).toBeVisible();
  await examplesFilter.click();
  await expect(examplesFilter).not.toBeChecked();
  await expect(page.getByText('Example', { exact: true })).toHaveCount(0);

  const dealName = `Zephyr Advisory ${Date.now()}`;
  await page.getByRole('link', { name: 'New deal' }).click();
  await expect(page).toHaveURL(new RegExp(`/home/${slug}/deals/new$`));
  const { dealId } = await createDeal(page, slug, dealName);

  await selectOption(comboboxWithText(page, 'Sourcing'), 'NDA Signed');
  await expect(comboboxWithText(page, 'NDA Signed')).toBeVisible({
    timeout: 30 * 1000,
  });

  await page.goto(`/home/${slug}/deals/${dealId}/financials`);
  await page.getByRole('button', { name: 'Create offer' }).click();
  const offerDialog = page.getByRole('dialog');
  await offerDialog
    .getByText('Purchase price (required)')
    .locator('..')
    .getByRole('spinbutton')
    .fill('750000');
  await offerDialog.getByRole('button', { name: 'Save version' }).click();
  await expect(offerDialog).toBeHidden();

  // Scope to the offer lifecycle action group (anchored on its unique "Add
  // buyer revision" button) so "Submit" does not collide with the disabled
  // Seller Questions "Submit".
  const offerActions = page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Add buyer revision' }) })
    .last();
  await offerActions.getByRole('button', { name: 'Submit' }).click();
  await expect(comboboxWithText(page, 'LOI Submitted')).toBeVisible({
    timeout: 30 * 1000,
  });

  await offerActions.getByRole('button', { name: 'Accept' }).click();
  await page.goto(`/home/${slug}/deals/${dealId}/documents`);
  await page.getByRole('button', { name: 'Record signed LOI' }).click();
  const signedLoi = page.getByRole('dialog', { name: 'Record signed LOI' });
  await signedLoi.getByLabel('Signed copy').setInputFiles({
    name: 'LOI signed.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  });
  await signedLoi
    .getByLabel('Signing date')
    .fill(new Date().toISOString().slice(0, 10));
  await signedLoi.getByLabel('Buyer').check();
  await signedLoi.getByRole('button', { name: 'Record signed LOI' }).click();
  await expect(signedLoi).toBeHidden();
  await expect(comboboxWithText(page, 'LOI Accepted')).toBeVisible({
    timeout: 30 * 1000,
  });

  const contracts = await contractsForDeal(dealId);
  expect(contracts.length).toBeGreaterThanOrEqual(1);
  expect(contracts[0]!.type).toBe('loi');

  await page.goto(`/home/${slug}/deals/${dealId}/financials`);
  await expect(async () => {
    await page.getByRole('button', { name: 'New SDE' }).click();
    await page.waitForURL(/\/financials\/calcs\/[0-9a-f-]{36}$/, { timeout: 8000 });
  }).toPass({ timeout: 60 * 1000 });
  await expect(page.getByRole('heading', { name: /^SDE v\d+, /, level: 1 })).toBeVisible();

  await sdeRow(page, 'Sales').getByRole('textbox').fill('1000000');
  await sdeRow(page, 'COGS').getByRole('textbox').fill('400000');
  await sdeRow(page, 'Operating expenses')
    .getByRole('textbox')
    .fill('300000');
  await sdeRow(page, 'Owner salary').getByRole('textbox').fill('200000');
  await sdeRow(page, 'Depreciation and amortization')
    .getByRole('textbox')
    .fill('7676');

  // (1,000,000 - 400,000 - 300,000) + 200,000 + 7,676 = 507,676
  await expect(page.getByText('$507,676').first()).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.goto(`/home/${slug}/deals/${dealId}/financials`);
  await expect(page.getByText('Weighted SDE $507,676')).toBeVisible();

  await expect(page.getByText('No financials adopted yet')).toBeVisible();
  await calcRowAction(page, page.getByRole('row').filter({ hasText: 'SDE' }).last(), 'Adopt');
  await expect(page.getByText('No financials adopted yet')).toHaveCount(0, {
    timeout: 30 * 1000,
  });
  await expect(page.getByText('$507,676').first()).toBeVisible();

  await page.goto(`/home/${slug}/deals/${dealId}/diligence`);
  await page.getByPlaceholder('New item title').fill('Confirm financials');
  await page.getByRole('button', { name: 'Add item' }).click();

  const checklistRow = page
    .getByRole('row')
    .filter({ hasText: 'Confirm financials' });
  await checklistRow.getByLabel('Status of Confirm financials').selectOption('clean');
  await expect(
    checklistRow.getByLabel('Status of Confirm financials'),
  ).toHaveValue('clean');

  await page.reload();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'Confirm financials' })
      .getByLabel('Status of Confirm financials'),
  ).toHaveValue('clean');

  await page.goto(`/home/${slug}/deals/${dealId}`);
  await page.getByRole('button', { name: 'Mark won' }).click();
  await expect(page.getByText('Won (closed)').first()).toBeVisible({
    timeout: 30 * 1000,
  });

  // 10. Deals list: visible in both card and table views, and a filter narrows to it.
  await page.goto(`/home/${slug}/deals`);
  await expect(page.getByRole('button', { name: 'Cards' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: dealName }).first(),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Table' }).click();
  await expect(page).toHaveURL(/view=table/);
  await expect(
    page.getByRole('cell').filter({ hasText: dealName }).first(),
  ).toBeVisible();

  await page.getByPlaceholder('Search deals').fill('Zephyr');
  await expect(
    page.getByRole('cell').filter({ hasText: dealName }).first(),
  ).toBeVisible({ timeout: 30 * 1000 });
  await expect(
    page.getByText('[Example] Sample sourced deal for onboarding'),
  ).toHaveCount(0);
});
