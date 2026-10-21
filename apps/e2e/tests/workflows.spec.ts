import type { Page } from '@playwright/test';

import {
  completeInviteeOnboarding,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { addTeamMember } from './fixtures/calc';
import { waitForMessageContaining } from './fixtures/mail';
import {
  FAILING_MESSAGE,
  notifyGraph,
  seedWorkflow,
  teamIdOf,
  waitForRun,
} from './fixtures/workflows';

async function setUpTeam(page: Page, auth: { signUp: (page: Page, user?: ReturnType<typeof newCredentials>) => Promise<unknown> }) {
  const owner = newCredentials();
  await auth.signUp(page, owner);
  const stamp = Date.now();
  const teamSlug = await completeTeamOnboarding(page, `Flow Team ${stamp}`);
  return {
    owner,
    stamp,
    teamSlug,
    accountId: await teamIdOf(teamSlug),
    ownerId: await db.userIdByEmail(owner.email),
    listPath: `/home/${teamSlug}/workflows`,
  };
}

test('a manager runs a published workflow, archives it and brings it back', async ({
  page,
  auth,
}) => {
  test.setTimeout(150 * 1000);

  const { stamp, accountId, ownerId, listPath } = await setUpTeam(page, auth);
  const name = `Weekly review ${stamp}`;
  const workflowId = await seedWorkflow({ accountId, name, publishedBy: ownerId });

  await page.goto(listPath);
  await expect(page.getByRole('link', { name: 'Workflows', exact: true }).first()).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row.getByText('Disabled')).toBeVisible();
  await expect(row.getByText(/^Published /)).toBeVisible();
  await expect(row.getByText('Never run')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New workflow' })).toHaveCount(0);

  await row.getByRole('button', { name: 'Run now' }).click();
  const runId = await waitForRun(workflowId, 'succeeded');

  await page.goto(`${listPath}/${workflowId}`);
  await expect(page.getByRole('heading', { name: name, level: 1 })).toBeVisible();
  await expect(page.getByText('Version 1').first()).toBeVisible();
  await page.getByRole('button', { name: 'Cancel waiting runs' }).click();
  await page.getByRole('dialog', { name: 'Cancel waiting runs' }).getByRole('button', { name: 'Cancel older runs' }).click();
  await expect(page.getByText('Cancelled 0 runs')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: /\d/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
  await expect(page.getByText('notify', { exact: true })).toBeVisible();
  await expect(page.getByText('Succeeded')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Retry from failed step' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel run' })).toHaveCount(0);

  await page.goto(listPath);
  await row.getByRole('button', { name: 'Archive' }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('link', { name: 'Archived', exact: true }).click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Unarchive' }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('link', { name: 'Active', exact: true }).click();
  await expect(row.getByText('Disabled')).toBeVisible();
});

test('enabling an unpublished workflow is refused', async ({ page, auth }) => {
  test.setTimeout(90 * 1000);

  const { stamp, accountId, listPath } = await setUpTeam(page, auth);
  const name = `Draft only ${stamp}`;
  await seedWorkflow({ accountId, name });

  await page.goto(listPath);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row.getByText('Not published')).toBeVisible();
  await row.getByRole('button', { name: 'Enable' }).click();
  await expect(row.getByRole('alert')).toHaveText('Publish this workflow first');
});

test('a non-manager sees no workflow controls', async ({ page, browser, auth }) => {
  test.setTimeout(150 * 1000);

  const { stamp, teamSlug, accountId, ownerId, listPath } = await setUpTeam(page, auth);
  const name = `Visible only ${stamp}`;
  const workflowId = await seedWorkflow({ accountId, name, publishedBy: ownerId });
  await page.goto(listPath);
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Run now' }).click();
  const runId = await waitForRun(workflowId, 'succeeded');

  const member = newCredentials();
  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await auth.signUp(memberPage, member);
  await addTeamMember(teamSlug, await db.userIdByEmail(member.email), 'member');
  await completeInviteeOnboarding(memberPage, teamSlug, 'Mia Member');

  await memberPage.goto(listPath);
  await expect(memberPage.getByRole('row').filter({ hasText: name })).toBeVisible();
  for (const control of ['Run now', 'Enable', 'Disable', 'Archive']) {
    await expect(memberPage.getByRole('button', { name: control, exact: true })).toHaveCount(0);
  }

  await memberPage.goto(`${listPath}/${workflowId}/runs/${runId}`);
  await expect(memberPage.getByText('Succeeded').first()).toBeVisible();
  await expect(memberPage.getByRole('button', { name: 'Cancel run' })).toHaveCount(0);
  await expect(memberPage.getByRole('button', { name: 'Retry from failed step' })).toHaveCount(0);
  await memberPage.goto(`${listPath}/${workflowId}`);
  await expect(memberPage.getByRole('button', { name: 'Cancel waiting runs' })).toHaveCount(0);
  await context.close();
});

test('a failed run shows its error and retry, tells the manager and sends an email', async ({
  page,
  auth,
}) => {
  test.setTimeout(150 * 1000);

  const { stamp, owner, accountId, ownerId, listPath } = await setUpTeam(page, auth);
  const name = `Broken reminder ${stamp}`;
  const workflowId = await seedWorkflow({
    accountId,
    name,
    publishedBy: ownerId,
    graph: notifyGraph(FAILING_MESSAGE, 'Send reminder'),
  });

  await page.goto(listPath);
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Run now' }).click();
  const runId = await waitForRun(workflowId, 'failed');
  const runPath = `${listPath}/${workflowId}/runs/${runId}`;

  await page.goto(runPath);
  await expect(page.getByText('Send reminder', { exact: true })).toBeVisible();
  await expect(page.getByText('Failed').first()).toBeVisible();
  await expect(page.locator('p.text-destructive').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry from failed step' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel run' })).toHaveCount(0);

  await expect
    .poll(
      async () =>
        (
          await db.rows<{ link: string }>(
            'notifications',
            `recipient_user_id=eq.${ownerId}&body=eq.${encodeURIComponent(`${name} failed at Send reminder`)}&select=link`,
          )
        )[0]?.link,
      { timeout: 60 * 1000 },
    )
    .toBe(runPath);
  await page.goto(`/home/${runPath.split('/')[2]}`);
  await page.locator('button:has(svg.lucide-bell)').click();
  await page.getByRole('link', { name: `${name} failed at Send reminder` }).click();
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));

  await waitForMessageContaining({ to: owner.email, text: `${name} failed at Send reminder` });
});

test('bad workflow links are not found', async ({ page, browser, auth }) => {
  test.setTimeout(150 * 1000);

  const first = await setUpTeam(page, auth);
  const workflowId = await seedWorkflow({
    accountId: first.accountId,
    name: `Mine ${first.stamp}`,
    publishedBy: first.ownerId,
  });
  const base = first.listPath;

  const context = await browser.newContext();
  const other = await context.newPage();
  const second = await setUpTeam(other, auth);
  const foreignId = await seedWorkflow({
    accountId: second.accountId,
    name: `Theirs ${second.stamp}`,
    publishedBy: second.ownerId,
  });

  const status = async (path: string) => (await page.goto(path))!.status();
  expect(await status(`${base}/not-a-uuid`)).toBe(404);
  expect(await status(`${base}/${workflowId}/runs/not-a-uuid`)).toBe(404);
  expect(await status(`${base}/${foreignId}`)).toBe(404);
  expect(await status(`${base}/${workflowId}/runs/00000000-0000-4000-8000-000000000000`)).toBe(404);
  await context.close();
});

test('the workflow pages fit the viewport at three widths', async ({ page, auth }) => {
  test.setTimeout(150 * 1000);

  const { stamp, accountId, ownerId, listPath } = await setUpTeam(page, auth);
  const name = `Layout ${stamp}`;
  const workflowId = await seedWorkflow({ accountId, name, publishedBy: ownerId });
  await page.goto(listPath);
  await page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Run now' }).click();
  const runId = await waitForRun(workflowId, 'succeeded');

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [listPath, `${listPath}/${workflowId}`, `${listPath}/${workflowId}/runs/${runId}`]) {
      await page.goto(path);
      await expect(page.locator('main').last()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
