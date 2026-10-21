import {
  completeTeamOnboarding,
  db,
  expect,
  test,
} from './fixtures';
import { CALC_URL, saveCalc } from './fixtures/calc';
import { deleteDataRoomDocument } from './fixtures/db-update';
import { createDeal, uploadToDataRoom } from './fixtures/deal';
import { pdfDocument, XLSX_CONTENT_TYPE, xlsxWorkbook } from './fixtures/files';

test('calc inputs cite data room files at a page, sheet or cell and follow newer versions', async ({
  page,
  context,
  auth,
  cleanup,
}) => {
  test.setTimeout(180 * 1000);

  const stamp = Date.now();
  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Cite Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Cite Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await uploadToDataRoom(page, dealPath, [
    { name: 'p-and-l.pdf', mimeType: 'application/pdf', buffer: pdfDocument(5) },
    { name: 'tax-returns.xlsx', mimeType: XLSX_CONTENT_TYPE, buffer: xlsxWorkbook(['Summary', 'P&L 2023']) },
    { name: 'site-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
  ]);
  const documents = () =>
    db.rows<{ id: string; name: string }>('dr_document', `deal_id=eq.${dealId}&select=id,name&order=created_at`);
  await expect.poll(async () => (await documents()).length, { timeout: 60 * 1000 }).toBe(3);

  await page.goto(`${dealPath}/financials`);
  await page.getByRole('button', { name: 'New SDE' }).click();
  await page.waitForURL(CALC_URL);
  const calcId = CALC_URL.exec(new URL(page.url()).pathname)![1]!;
  await page.getByRole('textbox', { name: 'Sales, period 1' }).fill('1000000');
  await page.getByRole('textbox', { name: 'COGS, period 1' }).fill('400000');
  await page.getByRole('textbox', { name: 'Operating expenses, period 1' }).fill('300000');
  await saveCalc(page);

  await page.getByRole('button', { name: 'Add period' }).click();
  await expect(page.getByRole('button', { name: 'Cite source for Sales, period 2' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cite source for Sales, period 2' })).toHaveAttribute(
    'title',
    'Save the calc to add sources to this row',
  );
  await page.getByRole('button', { name: 'Remove period 2' }).click();

  const cite = async (field: string, file: string, where?: { label: string; value: string }, cell?: string) => {
    await page.getByRole('button', { name: `Cite source for ${field}` }).click();
    await page.getByRole('button', { name: file, exact: true }).click();
    if (where) {
      await page.getByLabel(where.label, { exact: true }).fill(where.value);
    } else {
      await expect(page.getByLabel('Page', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Sheet', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Cell (optional)')).toHaveCount(0);
    }
    if (cell) {
      await page.getByLabel('Cell (optional)').fill(cell);
    }
    await page.getByRole('button', { name: 'Add source', exact: true }).click();
  };

  await cite('Sales, period 1', 'p-and-l.pdf v1', { label: 'Page', value: '4' }, 'B12');
  await expect(page.getByRole('button', { name: 'p-and-l.pdf v1, page 4, cell B12', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await cite('COGS, period 1', 'tax-returns.xlsx v1', { label: 'Sheet', value: 'P&L 2023' });
  await expect(page.getByRole('button', { name: 'tax-returns.xlsx v1, sheet P&L 2023', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await cite('Operating expenses, period 1', 'site-photo.jpg v1');
  await expect(page.getByRole('button', { name: 'site-photo.jpg v1', exact: true }).last()).toBeVisible();
  await page.keyboard.press('Escape');

  const [pdf] = (await documents()).filter((doc) => doc.name === 'p-and-l.pdf');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Cite source for Sales, period 1' }).click();
  await page.getByRole('button', { name: 'p-and-l.pdf v1, page 4, cell B12', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain(`doc=${pdf!.id}`);
  expect(popup.url()).toContain('page=4');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cite source for COGS, period 1' }).click();
  await page.getByRole('button', { name: 'tax-returns.xlsx v1, sheet P&L 2023', exact: true }).click();
  await expect.poll(() => popup.url()).toContain('sheet=');
  expect(context.pages().filter((each) => each.url().includes('/deal-windows/'))).toHaveLength(1);
  await popup.close();

  await uploadToDataRoom(page, dealPath, [
    { name: 'p-and-l.pdf', mimeType: 'application/pdf', buffer: pdfDocument(6) },
  ]);
  await expect.poll(async () => (await documents()).length, { timeout: 60 * 1000 }).toBe(4);

  await page.goto(`${dealPath}/financials/calcs/${calcId}`);
  await page.getByRole('button', { name: 'Cite source for Sales, period 1' }).click();
  await expect(page.getByText('Newer version uploaded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'p-and-l.pdf v2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'p-and-l.pdf v1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show older versions' }).click();
  await expect(page.getByRole('button', { name: 'p-and-l.pdf v1', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await deleteDataRoomDocument((await documents()).find((doc) => doc.name === 'site-photo.jpg')!.id);
  await page.goto(`${dealPath}/financials/calcs/${calcId}`);
  await page.getByRole('button', { name: 'Cite source for Operating expenses, period 1' }).click();
  await expect(page.getByText('Document removed')).toBeVisible();
});
