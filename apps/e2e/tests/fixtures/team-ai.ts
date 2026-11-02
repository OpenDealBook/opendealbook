import { expect, type Page } from '@playwright/test';

import type { TestUser } from './auth';
import { llm } from './stand-ins';
import { teamIdOf } from './workflows';

import { randomUUID } from 'node:crypto';

export async function connectTeamAi(
  page: Page,
  {
    user,
    teamSlug,
    reply,
  }: { user: TestUser; teamSlug: string; reply: object },
) {
  const model = `team-ai-${randomUUID()}`;
  await llm.connectTeam(user, await teamIdOf(teamSlug), model);
  await llm.reply(model, JSON.stringify(reply));

  await page.goto(`/home/${teamSlug}/outreach`);
  await page.getByLabel('AI credits per month').fill('10');
  await page.getByRole('button', { name: 'Save caps' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.getByLabel('AI credits per month')).toHaveValue('10', {
      timeout: 3000,
    });
  }).toPass({ timeout: 30 * 1000 });
}
