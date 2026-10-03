import { faker } from '@faker-js/faker';
import {
  type APIRequestContext,
  type Locator,
  type Page,
  expect,
  test,
} from '@playwright/test';

// Local Supabase demo keys; identical across every local stack. Used only for a
// contract spot-check (no UI) and to seed one checklist item (no UI path exists
// to create checklist items on a personal deal; see the checklist step note).
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const serviceHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

function newCredentials() {
  return {
    email: faker.internet.email({ provider: 'tuckin.test' }).toLowerCase(),
    password: 'password-test-1234',
  };
}

async function signUp(page: Page) {
  const user = newCredentials();

  await page.goto('/auth/sign-up');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByLabel('Confirm password').fill(user.password);
  await page.getByRole('button', { name: 'Sign up' }).click();

  // A fresh user is not onboarded, so /home bounces to /onboarding.
  await page.waitForURL(/\/(home|onboarding)(\/|$)/);
  return user;
}

async function completePersonalOnboarding(page: Page) {
  await page.goto('/onboarding');

  await expect(page.getByLabel('Your name')).toBeVisible();
  await page.getByLabel('Your name').fill('Playwright Buyer');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Just me' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page
    .getByLabel('I accept the hosted terms of service')
    .check();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Deal box, then MFA; both skippable. Skipping MFA lands on /home.
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await page.waitForURL(/\/home(\/|$)/);
}

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

async function contractsForDeal(request: APIRequestContext, dealId: string) {
  const response = await request.get(
    `${SUPABASE_URL}/rest/v1/contract?deal_id=eq.${dealId}&select=id,type,status`,
    { headers: serviceHeaders },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string; type: string; status: string }[];
}

async function seedChecklistItem(
  request: APIRequestContext,
  dealId: string,
  title: string,
) {
  const response = await request.post(
    `${SUPABASE_URL}/rest/v1/rpc/append_deal_event`,
    {
      headers: serviceHeaders,
      data: {
        p_deal_id: dealId,
        p_aggregate_type: 'checklist_item',
        p_aggregate_id: faker.string.uuid(),
        p_event_type: 'checklist_item.added',
        p_payload: {
          title,
          kind: 'diligence',
          category: 'diligence',
          status: 'not_started',
        },
        p_actor_kind: 'service',
      },
    },
  );
  expect(response.ok()).toBeTruthy();
}

test('full deal flow: onboard, create, advance, offer, calc, checklist, resolve, list', async ({
  page,
  request,
}) => {
  test.setTimeout(480 * 1000);

  // 1. Fresh signup -> onboarding wizard (personal) -> /home.
  await signUp(page);
  await completePersonalOnboarding(page);
  await expect(page).toHaveURL(/\/home(\/|$)/);

  // 2. The 4 "Example:" deals are seeded on onboarding completion.
  await page.goto('/home/deals');
  await expect(page.getByRole('heading', { name: 'Deals' })).toBeVisible();
  await expect(page.getByText('Example', { exact: true })).toHaveCount(4);
  await expect(
    page.getByText('Harborview Tax & Advisory', { exact: false }).first(),
  ).toBeVisible();

  // 3. Create a new deal via the new-deal form.
  const dealName = `Zephyr Advisory ${Date.now()}`;
  await page.getByRole('link', { name: 'New deal' }).click();
  await expect(page).toHaveURL(/\/home\/deals\/new$/);
  await page.getByLabel('Description').fill(dealName);
  await page.getByRole('button', { name: 'Create deal' }).click();

  // 4. Land on the detail page.
  await page.waitForURL(
    /\/home\/deals\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  const dealId = page.url().split('/').pop()!;
  await expect(page.getByText(dealName).first()).toBeVisible();

  // 5. Change its stage and assert it advances.
  await selectOption(comboboxWithText(page, 'Sourcing'), 'NDA Signed');
  await expect(comboboxWithText(page, 'NDA Signed')).toBeVisible({
    timeout: 30 * 1000,
  });

  // 6. Offers: create -> submit (loi_submitted) -> accept (loi_accepted + contract).
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
  await expect(comboboxWithText(page, 'LOI Accepted')).toBeVisible({
    timeout: 30 * 1000,
  });

  const contracts = await contractsForDeal(request, dealId);
  expect(contracts.length).toBeGreaterThanOrEqual(1);
  expect(contracts[0]!.type).toBe('loi');

  // 7. Calculators: new SDE recast reproducing a weighted SDE, then adopt.
  await page.getByRole('button', { name: 'New SDE' }).click();
  await expect(
    page.getByRole('heading', { name: 'SDE editor' }),
  ).toBeVisible();

  await sdeRow(page, 'Sales').getByRole('spinbutton').fill('1000000');
  await sdeRow(page, 'COGS').getByRole('spinbutton').fill('400000');
  await sdeRow(page, 'Operating expenses').getByRole('spinbutton').fill('300000');
  await sdeRow(page, 'Owner salary').getByRole('spinbutton').fill('200000');
  await sdeRow(page, 'Depreciation and amortization')
    .getByRole('spinbutton')
    .fill('7676');

  // (1,000,000 - 400,000 - 300,000) + 200,000 + 7,676 = 507,676
  await expect(page.getByText('$507,676').first()).toBeVisible();

  // Save sits in the same flex group as the SDE-editor-only "Add period"
  // button; anchor on it so "Save" does not collide with other sections.
  const sdeSaveGroup = page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Add period' }) })
    .last();
  await sdeSaveGroup.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'SDE editor' }),
  ).toBeHidden();
  await expect(page.getByText('Weighted SDE $507,676')).toBeVisible();

  await expect(page.getByText('No financials adopted yet')).toBeVisible();
  await page.getByRole('button', { name: 'Adopt' }).click();
  await expect(page.getByText('No financials adopted yet')).toHaveCount(0, {
    timeout: 30 * 1000,
  });
  await expect(page.getByText('$507,676').first()).toBeVisible();

  // 8. Checklist: no UI path creates checklist items on a personal deal, so one
  // item is seeded via the event-append RPC (test setup), then its status is
  // changed through the real UI Select and re-read after reload to prove it
  // persisted.
  await seedChecklistItem(request, dealId, 'Confirm financials');
  await page.reload();

  const checklistRow = page
    .getByRole('row')
    .filter({ hasText: 'Confirm financials' });
  await selectOption(
    checklistRow.getByRole('combobox').first(),
    'reviewed',
  );
  // The status action is a fire-and-forget startTransition (onValueChange ->
  // action + router.refresh); assert the new value in place first, mirroring
  // the stage step, so the committing transaction is visible before a reload.
  await expect(
    comboboxWithText(checklistRow, 'reviewed'),
  ).toBeVisible({ timeout: 30 * 1000 });

  await page.reload();
  await expect(
    comboboxWithText(
      page.getByRole('row').filter({ hasText: 'Confirm financials' }),
      'reviewed',
    ),
  ).toBeVisible({ timeout: 30 * 1000 });

  // 9. Set resolution to Won.
  await page.getByRole('button', { name: 'Mark won' }).click();
  await expect(
    page.getByText('Won (closed)').first(),
  ).toBeVisible({ timeout: 30 * 1000 });

  // 10. Deals list: visible in both card and table views, and a filter narrows to it.
  await page.goto('/home/deals');
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
  await expect(page.getByText('Harborview Tax & Advisory')).toHaveCount(0);
});
