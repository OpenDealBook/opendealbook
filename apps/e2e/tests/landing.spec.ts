import type { Page } from '@playwright/test';

import {
  card,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal as createDealWithBusinessName } from './fixtures/deal';

async function createTeam(page: Page, name: string): Promise<string> {
  await page.goto('/home/create-team');
  await page.getByLabel('Team name').fill(name);
  await page.getByRole('button', { name: 'Create team' }).click();
  const { slug } = await db.waitForRow<{ slug: string }>(
    'accounts',
    `name=eq.${encodeURIComponent(name)}&select=slug`,
  );
  return slug;
}

async function deleteTeam(page: Page, slug: string) {
  await page.goto(`/home/${slug}/settings`);
  await page.getByRole('button', { name: 'Delete team' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete team' })
    .click();
  await expect
    .poll(async () => (await db.rows('accounts', `slug=eq.${slug}`)).length)
    .toBe(0);
}

async function createDeal(page: Page, teamSlug: string, description: string) {
  const { dealId, dealPath } = await createDealWithBusinessName(
    page,
    teamSlug,
    description,
  );
  await page.goto(`${dealPath}/parties`);
  return dealId;
}

test('/home lands on the last-used team', async ({ page, auth }) => {
  const stamp = Date.now();
  await auth.signUp(page);
  await completeTeamOnboarding(page, `Alpha Landing ${stamp}`);
  const lastUsed = await createTeam(page, `Zeta Landing ${stamp}`);
  await page.goto(`/home/${lastUsed}`);

  await page.goto('/home');

  await expect(page).toHaveURL(new RegExp(`/home/${lastUsed}$`));
});

test('/home shows the team picker to a member of two teams with no last-used team', async ({
  page,
  auth,
}) => {
  const stamp = Date.now();
  const first = `Beta Picker ${stamp}`;
  const second = `Gamma Picker ${stamp}`;
  await auth.signUp(page);
  const onboarded = await completeTeamOnboarding(
    page,
    `Alpha Picker ${stamp}`,
  );
  const firstSlug = await createTeam(page, first);
  const secondSlug = await createTeam(page, second);
  await deleteTeam(page, onboarded);

  await page.goto('/home');

  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole('heading', { name: 'Choose a team', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: first })).toHaveAttribute(
    'href',
    `/home/${firstSlug}`,
  );
  await expect(page.getByRole('link', { name: second })).toHaveAttribute(
    'href',
    `/home/${secondSlug}`,
  );
  await expect(page.getByRole('link', { name: 'Create a team' })).toHaveAttribute(
    'href',
    '/home/create-team',
  );
});

test('/home sends an onboarded user with no teams to create a team', async ({
  page,
  auth,
}) => {
  await auth.signUp(page);
  const only = await completeTeamOnboarding(page, `Solo Landing ${Date.now()}`);
  await deleteTeam(page, only);

  await page.goto('/home');

  await expect(page).toHaveURL(/\/home\/create-team$/);
  await expect(
    page.getByRole('heading', { name: 'Create team', level: 1 }),
  ).toBeVisible();
});

test('/home sends counsel on two open deals to their deals list', async ({
  page,
  browser,
  auth,
  counsel,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const firstDeal = `Counsel Landing One ${stamp}`;
  const secondDeal = `Counsel Landing Two ${stamp}`;
  const counselEmail = newCredentials().email;

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(
    page,
    `Counsel Landing Team ${stamp}`,
  );
  const firstId = await createDeal(page, teamSlug, firstDeal);
  await counsel.inviteBuyerCounsel(page, { email: counselEmail });
  await expect(card(page, 'Counsel').getByRole('status')).toHaveText(
    `Invite sent to ${counselEmail}`,
  );
  const secondId = await createDeal(page, teamSlug, secondDeal);
  await counsel.inviteBuyerCounsel(page, { email: counselEmail });
  await expect(card(page, 'Counsel').getByRole('status')).toHaveText(
    `Invite sent to ${counselEmail}`,
  );

  const context = await browser.newContext();
  const counselPage = await context.newPage();
  await counsel.signIn(counselPage, { email: counselEmail, dealId: secondId });

  await counselPage.goto('/home');

  await expect(counselPage).toHaveURL(/\/counsel$/);
  await expect(
    counselPage.getByRole('heading', { name: 'Your deals', level: 1 }),
  ).toBeVisible();
  await expect(
    counselPage.getByRole('link', { name: firstDeal }),
  ).toHaveAttribute('href', `/counsel/${firstId}`);
  await expect(
    counselPage.getByRole('link', { name: secondDeal }),
  ).toHaveAttribute('href', `/counsel/${secondId}`);

  await context.close();
});

test('/home sends counsel on one open deal to their deals list', async ({
  page,
  browser,
  auth,
  counsel,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const deal = `Counsel Landing Single ${stamp}`;
  const counselEmail = newCredentials().email;

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(
    page,
    `Counsel Single Team ${stamp}`,
  );
  const dealId = await createDeal(page, teamSlug, deal);
  await counsel.inviteBuyerCounsel(page, { email: counselEmail });
  await expect(card(page, 'Counsel').getByRole('status')).toHaveText(
    `Invite sent to ${counselEmail}`,
  );

  const context = await browser.newContext();
  const counselPage = await context.newPage();
  await counsel.signIn(counselPage, { email: counselEmail, dealId });

  await counselPage.goto('/home');

  await expect(counselPage).toHaveURL(/\/counsel$/);
  await expect(
    counselPage.getByRole('heading', { name: 'Your deals', level: 1 }),
  ).toBeVisible();
  await expect(counselPage.getByRole('link', { name: deal })).toHaveAttribute(
    'href',
    `/counsel/${dealId}`,
  );

  await context.close();
});

test('removed personal pages are not found while settings still works', async ({
  page,
  auth,
}) => {
  await auth.signUp(page);
  await completeTeamOnboarding(page, `Removed Pages ${Date.now()}`);

  for (const path of [
    '/home/deals',
    '/home/billing',
    '/home/todos',
    '/home/outreach',
    '/home/underwriting',
    '/home/deals/new',
  ]) {
    const response = await page.goto(path);
    expect(response!.status(), path).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
      path,
    ).toBeVisible();
  }

  const settings = await page.goto('/home/settings');
  expect(settings!.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Settings', level: 1 }),
  ).toBeVisible();
});
