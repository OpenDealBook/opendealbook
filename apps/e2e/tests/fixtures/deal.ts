import { expect, type Page } from '@playwright/test';

export async function createDeal(
  page: Page,
  teamSlug: string,
  businessName: string,
): Promise<{ dealId: string; dealPath: string }> {
  await page.goto(`/home/${teamSlug}/deals/new`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByLabel('Business name').fill(businessName);
  await page.locator('#industry').click();
  await page.getByRole('option').first().click();
  await page.getByLabel('Description').fill(`${businessName} description`);
  await page.getByRole('button', { name: 'Create deal' }).click();
  await page.waitForURL(new RegExp(`/home/${teamSlug}/deals/[0-9a-f-]{36}$`));
  const dealId = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByText(businessName).first()).toBeVisible();
  return { dealId, dealPath: `/home/${teamSlug}/deals/${dealId}` };
}

export async function uploadToDataRoom(
  page: Page,
  dealPath: string,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  await page.goto(`${dealPath}/documents`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await page.locator('input[type=file]').setInputFiles(files);
  await page
    .locator('input[type=file]')
    .locator('xpath=ancestor::div[contains(@class,"border-dashed")]')
    .getByRole('button', { name: 'Upload', exact: true })
    .click();
}
