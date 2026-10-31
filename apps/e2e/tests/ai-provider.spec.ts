import {
  completeInviteeOnboarding,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { addTeamMember } from './fixtures/calc';

test('a manager connects a local stand-in URL on the e2e stack and disconnects the AI provider; a member sees it read-only', async ({
  page,
  browser,
  auth,
}) => {
  test.setTimeout(150 * 1000);

  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `AI Team ${Date.now()}`);
  const settings = `/home/${teamSlug}/settings`;

  await page.goto(settings);
  await expect(page.getByLabel('API key', { exact: true })).not.toHaveAttribute('placeholder', /Saved/);
  await page.getByLabel('Provider', { exact: true }).selectOption('openai_compatible');
  await page.getByLabel('Model', { exact: true }).fill('llama-test');
  await page.getByLabel('API key', { exact: true }).fill('sk-not-a-real-key');
  await page.getByLabel('Base URL', { exact: true }).fill('http://127.0.0.1:9999/v1');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page.getByLabel('API key', { exact: true })).toBeEnabled({ timeout: 60 * 1000 });
  expect(await page.locator('p[role=alert]').allTextContents()).toEqual([]);
  await page.reload();
  await expect(page.getByLabel('API key', { exact: true })).toHaveAttribute(
    'placeholder',
    'Saved. Paste a new key to replace it',
  );
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('llama-test');
  await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue('http://127.0.0.1:9999/v1');
  await expect(page.locator('p[role=alert]')).toHaveCount(0);
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('API key', { exact: true })).toHaveAttribute('type', 'password');

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `settings at ${width}px`,
    ).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  const member = newCredentials();
  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await auth.signUp(memberPage, member);
  await addTeamMember(teamSlug, await db.userIdByEmail(member.email), 'member');
  await completeInviteeOnboarding(memberPage, teamSlug, 'Mia Member');
  await memberPage.goto(settings);
  await expect(memberPage.getByText('AI provider', { exact: true })).toBeVisible();
  await expect(memberPage.getByLabel('API key', { exact: true })).toHaveCount(0);
  await expect(memberPage.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  await context.close();

  await page.getByRole('button', { name: 'Disconnect' }).click();
  const dialog = page.getByRole('dialog', { name: 'Disconnect the AI provider?' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('llama-test');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
  await expect(page.getByLabel('API key', { exact: true })).not.toHaveAttribute('placeholder', /Saved/);
});
