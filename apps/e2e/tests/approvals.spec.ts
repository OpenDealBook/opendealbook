import {
  completeInviteeOnboarding,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { addTeamMember } from './fixtures/calc';
import { approvalGraph, seedWorkflow, teamIdOf, waitForRun } from './fixtures/workflows';

async function setUp(page: import('@playwright/test').Page, auth: { signUp: (page: import('@playwright/test').Page, user?: ReturnType<typeof newCredentials>) => Promise<unknown> }) {
  const owner = newCredentials();
  await auth.signUp(page, owner);
  const stamp = Date.now();
  const teamSlug = await completeTeamOnboarding(page, `Approve Team ${stamp}`);
  return {
    stamp,
    teamSlug,
    accountId: await teamIdOf(teamSlug),
    ownerId: await db.userIdByEmail(owner.email),
    approvals: `/home/${teamSlug}/approvals`,
    workflows: `/home/${teamSlug}/workflows`,
  };
}

test('a waiting approval is decided in the inbox and the run follows the approved path', async ({
  page,
  context,
  auth,
}) => {
  test.setTimeout(150 * 1000);

  const { stamp, accountId, ownerId, approvals, workflows } = await setUp(page, auth);
  const name = `Needs approval ${stamp}`;
  const prompt = `OK to continue ${stamp}?`;
  const workflowId = await seedWorkflow({
    accountId,
    name,
    publishedBy: ownerId,
    graph: approvalGraph(prompt),
    schemaVersion: 2,
  });

  await page.goto(workflows);
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Run now' }).click();
  const runId = await waitForRun(workflowId, 'awaiting_approval');
  const runPath = `${workflows}/${workflowId}/runs/${runId}`;

  await page.goto(runPath);
  await expect(page.getByText('Waiting for approval')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Decide in Approvals' })).toHaveAttribute('href', approvals);

  await page.goto(approvals);
  const card = page.locator('li').filter({ hasText: prompt });
  await expect(card).toBeVisible();
  const staleTab = await context.newPage();
  await staleTab.goto(approvals);
  const staleCard = staleTab.locator('li').filter({ hasText: prompt });
  await expect(staleCard).toBeVisible();

  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0);

  await staleCard.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(staleCard.getByRole('alert')).toHaveText('This was already decided. Refresh to see it.');
  await staleTab.close();

  await waitForRun(workflowId, 'succeeded');
  await page.goto(runPath);
  await expect(page.getByText('Approved path', { exact: true })).toBeVisible();
  await expect(page.getByText('Rejected path', { exact: true })).toHaveCount(0);
});

test('team facts can be added, edited and deleted', async ({ page, auth }) => {
  test.setTimeout(90 * 1000);

  const { stamp, approvals } = await setUp(page, auth);
  const fact = `We never fund restaurants ${stamp}`;
  const edited = `We never fund bars ${stamp}`;

  await page.goto(approvals);
  await expect(page.getByRole('heading', { name: 'Team facts' })).toBeVisible();
  await page.getByLabel('New fact').fill(fact);
  await page.getByRole('button', { name: 'Add fact' }).click();
  const row = page.locator('li').filter({ hasText: fact });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit fact').fill(edited);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const editedRow = page.locator('li').filter({ hasText: edited });
  await expect(editedRow).toBeVisible();
  await expect(page.getByText(fact, { exact: true })).toHaveCount(0);

  await editedRow.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this fact?' });
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(editedRow).toBeVisible();
  await editedRow.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete fact' }).click();
  await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
});

test('the approvals page is for managers only and fits the viewport', async ({ page, browser, auth }) => {
  test.setTimeout(120 * 1000);

  const { teamSlug, approvals } = await setUp(page, auth);

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(approvals);
    await expect(page.getByRole('heading', { name: 'Waiting for a decision' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `approvals at ${width}px`,
    ).toBeLessThanOrEqual(0);
  }

  const member = newCredentials();
  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await auth.signUp(memberPage, member);
  await addTeamMember(teamSlug, await db.userIdByEmail(member.email), 'member');
  await completeInviteeOnboarding(memberPage, teamSlug, 'Mia Member');
  expect((await memberPage.goto(approvals))!.status()).toBe(404);
  await expect(memberPage.getByRole('link', { name: 'Approvals', exact: true })).toHaveCount(0);
  await context.close();
});
