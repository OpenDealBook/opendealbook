import type { Page } from '@playwright/test';

import {
  completeTeamOnboarding,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

const CALC_URL = /\/financials\/calcs\/([0-9a-f-]{36})$/;

async function dirty(page: Page) {
  await expect
    .poll(() => page.evaluate(() => window.history.state?.unsavedGuard === true))
    .toBe(true);
}

async function newSde(page: Page, financials: string, sales: string) {
  await page.goto(financials);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'New SDE' }).click();
  await page.waitForURL(CALC_URL);
  const id = CALC_URL.exec(new URL(page.url()).pathname)![1]!;
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByRole('textbox', { name: 'Sales, period 1' }).fill(sales);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  return id;
}

test('the calc page saves in place, guards unsaved edits, opens in a window and compares', async ({
  page,
  context,
  browser,
  auth,
}) => {
  test.setTimeout(180 * 1000);

  const owner = newCredentials();
  await auth.signUp(page, owner);
  const teamSlug = await completeTeamOnboarding(page, `Calc Team ${Date.now()}`);
  const { dealPath } = await createDeal(page, teamSlug, `Calc Deal ${Date.now()}`);
  const financials = `${dealPath}/financials`;

  const first = await newSde(page, financials, '1000000');
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Sales, period 1' }).pressSequentially('5');
  await dirty(page);
  const home = page.getByRole('main').getByRole('link').first();
  await home.click();
  const guard = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Keep editing' }).click();
  await expect(guard).toBeHidden();
  await expect(page).toHaveURL(CALC_URL);

  const newTab = context.waitForEvent('page');
  await home.click({ modifiers: ['ControlOrMeta'] });
  await (await newTab).close();
  await expect(guard).toBeHidden();

  await page.goBack();
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Keep editing' }).click();
  await page.goForward();
  await expect(page).toHaveURL(CALC_URL);

  const beforeUnload = new Promise<string>((resolve) =>
    page.once('dialog', (dialog) => {
      resolve(dialog.type());
      void dialog.dismiss();
    }),
  );
  await page.reload({ waitUntil: 'commit' }).catch(() => undefined);
  expect(await beforeUnload).toBe('beforeunload');

  await page.getByRole('textbox', { name: 'Sales, period 1' }).pressSequentially('5');
  await dirty(page);
  await home.click();
  await guard.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/home/${teamSlug}/deals$`));

  await page.goto(`${financials}/calcs/${first}`);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open in new window' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(await popup.evaluate(() => window.toolbar.visible)).toBe(false);
  await page.getByRole('button', { name: 'Open in new window' }).click();
  await popup.waitForLoadState();
  expect(context.pages().filter((each) => each.url().includes(`/calcs/${first}`))).toHaveLength(2);
  await popup.close();

  for (const size of [
    { width: 720, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  const second = await newSde(page, financials, '1500000');
  await page.goto(`${financials}/calcs/compare?a=${first}&b=${second}`);
  await expect(page.getByRole('heading', { name: 'Compare versions' })).toBeVisible();
  await expect(page.getByText('1,500,000').first()).toBeVisible();

  const status = async (path: string) => (await page.goto(path))!.status();
  expect(await status(`${financials}/calcs/00000000-0000-4000-8000-000000000000`)).toBe(404);
  expect(await status(`${financials}/calcs/compare?a=${first}`)).toBe(404);
  expect(await status(`${financials}/calcs/compare?a=${first}&b=${first}x`)).toBe(404);

  await page.goto(financials);
  await expect(page.getByRole('button', { name: 'More actions' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open' }).first()).toBeVisible();

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await auth.signUp(outsider);
  await completeTeamOnboarding(outsider, `Other Team ${Date.now()}`);
  expect((await outsider.goto(`${financials}/calcs/${first}`))!.status()).toBe(404);
  await outsiderContext.close();
});

test('the unsaved-edit guard also holds a sidebar link', async ({ page, auth }) => {
  test.setTimeout(120 * 1000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __trace: string[] }).__trace = log;
    const note = (what: string, event?: Event) =>
      log.push(
        `${Math.round(performance.now())} ${what}${event ? ` target=${(event.target as Element)?.tagName} prevented=${event.defaultPrevented} phase=${event.eventPhase}` : ''}`,
      );
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'click', 'popstate', 'beforeunload']) {
      document.addEventListener(type, (event) => note(`${type}:capture`, event), true);
      window.addEventListener(type, (event) => note(`${type}:window`, event));
    }
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);
      history[method] = (...args: Parameters<History['pushState']>) => {
        note(`history.${method} ${String(args[2])}`);
        return original(...args);
      };
    }
  });

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Sidebar Team ${Date.now()}`);
  const { dealPath } = await createDeal(page, teamSlug, `Sidebar Deal ${Date.now()}`);
  await newSde(page, `${dealPath}/financials`, '1000000');

  const sales = page.getByRole('textbox', { name: 'Sales, period 1' });
  await sales.pressSequentially('5');
  await dirty(page);
  const focused = await sales.evaluate((element) => element === document.activeElement);
  const before = page.url();
  await page.evaluate(() => ((window as unknown as { __trace: string[] }).__trace.length = 0));

  await page.getByRole('complementary').getByRole('link', { name: 'Home', exact: true }).click();
  const trace = await page.evaluate(() => (window as unknown as { __trace: string[] }).__trace).catch(() => ['page navigated away; trace lost']);
  console.log('SIDEBAR focused=%s url=%s\n%s', focused, page.url(), trace.join('\n'));

  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  expect(page.url()).toBe(before);
});
