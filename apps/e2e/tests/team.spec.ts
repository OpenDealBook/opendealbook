import { expect, test } from '@playwright/test';

import { signUp } from './fixtures/auth';

test.describe('team accounts', () => {
  test('creates a team and opens its members and invite form', async ({
    page,
  }) => {
    await signUp(page);

    await page.goto('/home/create-team');

    const teamName = `Crew ${Date.now()}`;
    await page.getByLabel('Team name').fill(teamName);

    // The name field slugifies into the slug field on change; read it back so
    // navigation targets the slug the server actually created.
    const slug = await page.getByLabel('Slug').inputValue();
    expect(slug).not.toEqual('');

    await page.getByRole('button', { name: 'Create team' }).click();

    await page.goto(`/home/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/home/${slug}(/|$)`));

    await page.goto(`/home/${slug}/members`);

    await expect(
      page.getByRole('button', { name: 'Send invitations' }),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
  });
});
