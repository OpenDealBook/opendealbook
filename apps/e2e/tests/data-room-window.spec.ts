import {
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';
import { wordDocument } from './fixtures/docx';
import { pdfDocument, xlsxWorkbook, XLSX_CONTENT_TYPE } from './fixtures/files';

test('the data room window opens documents at a page or sheet and refuses outsiders', async ({
  page,
  context,
  browser,
  auth,
  cleanup,
}) => {
  test.setTimeout(180 * 1000);

  const stamp = Date.now();
  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Window Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Window Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.goto(`${dealPath}/documents`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await page.locator('input[type=file]').setInputFiles([
    { name: 'p-and-l.pdf', mimeType: 'application/pdf', buffer: pdfDocument(5) },
    { name: 'P&L.xlsx', mimeType: XLSX_CONTENT_TYPE, buffer: xlsxWorkbook(['Summary', 'P&L 2023']) },
    {
      name: 'terms.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: wordDocument(Array.from({ length: 120 }, (_, index) => `Paragraph ${index + 1} of the terms`)),
    },
  ]);
  await page
    .locator('input[type=file]')
    .locator('xpath=ancestor::div[contains(@class,"border-dashed")]')
    .getByRole('button', { name: 'Upload', exact: true })
    .click();

  const documents = async () =>
    db.rows<{ id: string; name: string }>('dr_document', `deal_id=eq.${dealId}&select=id,name`);
  await expect.poll(async () => (await documents()).length, { timeout: 60 * 1000 }).toBe(3);
  const byName = Object.fromEntries((await documents()).map((doc) => [doc.name, doc.id]));
  const view = `/deal-windows/${teamSlug}/${dealId}/data-room/view`;

  await page.reload();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in data room window' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain(view);

  for (const size of [
    { width: 720, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
  ]) {
    await popup.setViewportSize(size);
    expect(
      await popup.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  }

  await popup.goto(`${view}?doc=${byName['p-and-l.pdf']}`);
  await expect(popup.getByText('Page 1 of 5')).toBeVisible({ timeout: 30 * 1000 });
  await popup.goto(`${view}?doc=${byName['p-and-l.pdf']}&page=3`);
  await expect(popup.getByText('Page 3 of 5')).toBeVisible({ timeout: 30 * 1000 });
  for (const [param, shown] of [['abc', 1], ['0', 1], ['999', 5]] as const) {
    await popup.goto(`${view}?doc=${byName['p-and-l.pdf']}&page=${param}`);
    await expect(popup.getByText(`Page ${shown} of 5`)).toBeVisible({ timeout: 30 * 1000 });
  }

  await popup.goto(`${view}?doc=${byName['P&L.xlsx']}&sheet=${encodeURIComponent('P&L 2023')}`);
  await expect(popup.getByRole('tab', { name: 'P&L 2023' })).toHaveAttribute('aria-selected', 'true', {
    timeout: 30 * 1000,
  });
  await popup.goto(`${view}?doc=${byName['P&L.xlsx']}&sheet=Missing`);
  await expect(popup.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true', {
    timeout: 30 * 1000,
  });

  await popup.goto(`${view}?doc=${byName['terms.docx']}&page=2`);
  await expect(popup.getByText(/^Page 2 of \d+$/)).toBeVisible({ timeout: 60 * 1000 });

  await popup.goto(`${view}?doc=00000000-0000-4000-8000-000000000000`);
  await expect(popup.getByText('That file is no longer available.')).toBeVisible();

  await page.getByRole('button', { name: 'Open', exact: true }).first().click();
  await page.waitForTimeout(500);
  expect(context.pages().filter((each) => each.url().includes('/deal-windows/'))).toHaveLength(1);
  await popup.close();

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await auth.signUp(outsider, newCredentials());
  await completeTeamOnboarding(outsider, `Window Outsider ${stamp}`);
  expect(
    (
      await outsider.goto(
        `/deal-windows/${teamSlug}/${dealId}/data-room/files/${byName['p-and-l.pdf']}`,
      )
    )!.status(),
  ).toBe(404);
  await outsiderContext.close();
});
