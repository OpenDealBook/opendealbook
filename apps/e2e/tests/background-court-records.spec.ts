import { completeTeamOnboarding, db, expect, test } from './fixtures';
import { createDeal } from './fixtures/deal';
import { STAND_INS, SUPABASE_URL, serviceHeaders } from './fixtures/stack';
import { connectTeamAi } from './fixtures/team-ai';
import { teamIdOf } from './fixtures/workflows';

const SUMMARY =
  'One open UCC filing from a state records broker is worth a look.';

async function serviceUpdate(table: string, query: string, values: object) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(values),
  });
  const text = await response.text();
  expect(response.ok, text).toBe(true);
  expect(JSON.parse(text), `one ${table} row matching ${query}`).toHaveLength(
    1,
  );
}

test('a background search lists a Middesk lien as Beta state court and lien records', async ({
  page,
  auth,
}) => {
  test.setTimeout(240 * 1000);

  const user = await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(
    page,
    `Broker Team ${Date.now()}`,
  );
  await connectTeamAi(page, {
    user,
    teamSlug,
    reply: {
      ratings: [
        { n: 1, severity: 'amber', tied: true, reason: 'An open UCC filing' },
      ],
      summary: SUMMARY,
    },
  });

  await page.goto(`/home/${teamSlug}/settings`);
  await page
    .getByRole('combobox', { name: 'Broker', exact: true })
    .selectOption('middesk');
  const brokerKey = page.getByLabel('Middesk API key');
  await brokerKey.fill('md-e2e-not-a-real-key');
  await page
    .locator('[data-slot=card]')
    .filter({ has: brokerKey })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel('Middesk API key')).toHaveAttribute(
      'placeholder',
      'Saved. Paste a new key to replace it',
      { timeout: 3000 },
    );
  }).toPass({ timeout: 30 * 1000 });
  await serviceUpdate(
    'provider_credential',
    `account_id=eq.${await teamIdOf(teamSlug)}&kind=eq.court_records`,
    { base_url: STAND_INS.middesk },
  );

  const { dealId, dealPath } = await createDeal(
    page,
    teamSlug,
    'Larkspur Tile Works',
  );
  const [deal] = await db.rows<{ firm_id: string }>(
    'deal',
    `id=eq.${dealId}&select=firm_id`,
  );
  await serviceUpdate('firm', `id=eq.${deal!.firm_id}`, {
    city: 'Austin',
    state: 'TX',
  });

  await page.goto(`${dealPath}/background`);
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(SUMMARY)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 90 * 1000 });

  const amber = page.locator('section[data-severity=amber]');
  await expect(amber.getByRole('heading')).toHaveText('Amber (1)');
  await expect(
    amber.getByText(
      'Broker results are not yet verified against live Baselayer and Middesk accounts.',
    ),
  ).toBeVisible();
  const finding = amber.getByRole('listitem');
  await expect(finding.getByText('Thistledown Equipment Credit')).toBeVisible();
  await expect(
    finding.getByText('State court and lien recordsBeta', { exact: true }),
  ).toBeVisible();
  await expect(finding.getByText('An open UCC filing')).toBeVisible();
  await expect(finding.getByRole('link', { name: 'View source' })).toHaveCount(
    0,
  );
});
