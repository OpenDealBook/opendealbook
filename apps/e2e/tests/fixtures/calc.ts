import { expect, type Locator, type Page } from '@playwright/test';

import { rows, insert } from './db';

export const CALC_URL = /\/financials\/calcs\/([0-9a-f-]{36})$/;

const DEAL_FIELDS: Record<string, string> = {
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
};

export async function setField(page: Page, label: string, value: string) {
  await page.getByRole('main').getByLabel(label, { exact: true }).fill(value);
}

export async function newDealCalc(
  page: Page,
  financials: string,
  overrides: Record<string, string> = {},
) {
  await page.goto(financials);
  await page.getByRole('button', { name: 'New Deal' }).click();
  await page.waitForURL(CALC_URL);
  const id = CALC_URL.exec(new URL(page.url()).pathname)![1]!;
  await expect(page.getByRole('main').getByText('Profit and loss')).toBeVisible();
  for (const [label, value] of Object.entries({ ...DEAL_FIELDS, ...overrides })) {
    await setField(page, label, value);
  }
  await page.getByRole('button', { name: 'Add source' }).click();
  await page.locator('input[aria-label="Amount, source 1"]').fill('2000000');
  await page.locator('input[aria-label="Rate (%), source 1"]').fill('10.5');
  await page.locator('input[aria-label="Term (years), source 1"]').fill('10');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  return id;
}

export async function saveCalc(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}

export async function addTeamMember(
  teamSlug: string,
  userId: string,
  role: 'analyst' | 'admin' | 'member',
) {
  const [team] = await rows<{ id: string }>('accounts', `slug=eq.${teamSlug}&select=id`);
  await insert('accounts_memberships', {
    account_id: team!.id,
    user_id: userId,
    account_role: role,
  });
}

export async function calcRowAction(page: Page, row: Locator, action: string) {
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: action }).click();
}
