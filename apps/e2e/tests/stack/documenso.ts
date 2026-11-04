import { chromium, type Page } from '@playwright/test';

import { firstLink, waitForMessage } from '../fixtures/mail';
import { DOCUMENSO_URL, DOCUMENSO_WEBHOOK_SECRET } from '../fixtures/stack';

const ACCOUNT = {
  name: 'Open Deal Book E2E',
  email: 'e2e-documenso@opendealbook.test',
  password: 'E2e-Documenso-Pass-1!',
};

// The app handles these in packages/contracts/src/esign/documenso.ts.
const TRIGGERS = [
  'document.sent',
  'document.completed',
  'document.rejected',
  'document.cancelled',
  'recipient.expired',
];

interface ReactRoot {
  stateNode: { current: { memoizedState: { isDehydrated: boolean } } };
}

// Documenso server-renders its forms; filled or submitted before React
// hydrates the document, they reset or submit as a native GET with the
// password in the URL.
async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const key = Object.keys(document).find((name) =>
      name.startsWith('__reactContainer$'),
    );
    const root = key
      ? (document as unknown as Record<string, ReactRoot>)[key]
      : undefined;
    return root?.stateNode.current.memoizedState.isDehydrated === false;
  });
}

async function signIn(
  page: Page,
): Promise<'signed-in' | 'unverified' | 'no-account'> {
  await gotoHydrated(page, `${DOCUMENSO_URL}/signin`);
  await page.getByLabel('Email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  return Promise.race([
    page.waitForURL(/\/t\/[^/]+\//).then(() => 'signed-in' as const),
    page.waitForURL(/\/unverified-account$/).then(() => 'unverified' as const),
    page
      .getByText('The email or password provided is incorrect.', {
        exact: true,
      })
      .waitFor()
      .then(() => 'no-account' as const),
  ]);
}

async function signUp(page: Page) {
  await gotoHydrated(page, `${DOCUMENSO_URL}/signup`);
  await page.getByLabel('Full Name').fill(ACCOUNT.name);
  await page.getByLabel('Email Address').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByTestId('signature-pad-dialog-button').click();
  const pad = page.getByRole('dialog');
  await pad.getByRole('tab', { name: 'Type' }).click();
  await pad.getByPlaceholder('Type your signature').fill(ACCOUNT.name);
  await pad.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
}

// The verify page confirms the token from a client-side effect after load.
async function verifyEmail(page: Page) {
  const verification = await waitForMessage({ to: ACCOUNT.email });
  await gotoHydrated(page, firstLink(verification, /\/verify-email\//));
  await page.getByRole('heading', { name: 'Email Confirmed!' }).waitFor();
}

async function createApiToken(page: Page, teamUrl: string): Promise<string> {
  await gotoHydrated(page, `${DOCUMENSO_URL}/t/${teamUrl}/settings/tokens`);
  await page.getByRole('button', { name: 'Create token' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(`e2e ${new Date().toISOString()}`);
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Never' }).click();
  await dialog.getByRole('button', { name: 'Create token' }).click();
  return dialog.getByLabel('Your new API token').inputValue();
}

async function ensureWebhook(page: Page, teamUrl: string, webhookUrl: string) {
  await gotoHydrated(page, `${DOCUMENSO_URL}/t/${teamUrl}/settings/webhooks`);
  await page.getByRole('heading', { name: 'Webhooks' }).waitFor();
  await page.waitForLoadState('networkidle');

  if ((await page.getByText(webhookUrl).count()) > 0) {
    return;
  }

  await page.getByRole('button', { name: 'Create Webhook' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Webhook URL').fill(webhookUrl);
  await dialog.getByPlaceholder('Select triggers').click();
  for (const trigger of TRIGGERS) {
    await page.getByRole('option', { name: trigger, exact: true }).click();
  }
  await dialog.getByLabel('Webhook URL').click();
  await dialog.getByLabel('Secret').fill(DOCUMENSO_WEBHOOK_SECRET);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByText('Webhook created').first().waitFor();
}

// Documenso v2.18 mints API tokens only from a signed-in browser session, so
// the setup drives its UI. E2E_DOCUMENSO_API_KEY skips minting a new token.
export async function documensoApiKey({
  webhookUrl,
}: {
  webhookUrl: string;
}): Promise<string> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const outcome = await signIn(page);
  if (outcome !== 'signed-in') {
    if (outcome === 'no-account') {
      await signUp(page);
    }
    await verifyEmail(page);
    await page.context().clearCookies();
    await signIn(page);
  }

  const teamUrl = new URL(page.url()).pathname.split('/')[2]!;
  await ensureWebhook(page, teamUrl, webhookUrl);
  const apiKey =
    process.env.E2E_DOCUMENSO_API_KEY ?? (await createApiToken(page, teamUrl));
  await browser.close();

  return apiKey;
}
