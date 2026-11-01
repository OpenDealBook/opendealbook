import { completeTeamOnboarding, db, expect, test } from './fixtures';
import { createDeal } from './fixtures/deal';
import { SUPABASE_URL, serviceHeaders } from './fixtures/stack';
import { connectTeamAi } from './fixtures/team-ai';

const LICENSED_BUSINESS = 'Quillfeather Mechanical';

test('a background search on a Texas firm lists its state license without a source link', async ({
  page,
  auth,
}) => {
  test.setTimeout(180 * 1000);

  const user = await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(
    page,
    `License Team ${Date.now()}`,
  );
  await connectTeamAi(page, {
    user,
    teamSlug,
    reply: {
      ratings: [
        {
          n: 1,
          severity: 'green',
          tied: true,
          reason: 'An active trade license',
        },
      ],
    },
  });

  const { dealId, dealPath } = await createDeal(
    page,
    teamSlug,
    LICENSED_BUSINESS,
  );
  const [deal] = await db.rows<{ firm_id: string }>(
    'deal',
    `id=eq.${dealId}&select=firm_id`,
  );
  const patched = await fetch(
    `${SUPABASE_URL}/rest/v1/firm?id=eq.${deal!.firm_id}`,
    {
      method: 'PATCH',
      headers: serviceHeaders,
      body: JSON.stringify({ state: 'TX' }),
    },
  );
  expect(patched.ok, await patched.text()).toBe(true);

  await page.goto(`${dealPath}/background`);
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText('No concerns found')).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 90 * 1000 });

  const green = page.locator('section[data-severity=green]');
  await expect(green.getByRole('listitem')).toHaveCount(1);
  const finding = green.getByRole('listitem');
  await expect(
    finding.getByText('A/C Contractor from Texas TDLR'),
  ).toBeVisible();
  await expect(finding.getByText('Licenses', { exact: true })).toBeVisible();
  await expect(finding.getByText('An active trade license')).toBeVisible();
  await expect(finding.getByRole('link', { name: 'View source' })).toHaveCount(
    0,
  );
});
