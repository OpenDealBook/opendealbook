import { expect, test } from '@playwright/test';

import {
  completePersonalOnboarding,
  completeTeamOnboarding,
  invitationByEmail,
  membershipsForAccount,
  newCredentials,
  signUp,
} from './fixtures/team';

test('an invited member joins the team from the invite link', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(300 * 1000);

  // Owner: fresh signup, onboard as a team, open the members page.
  await signUp(page);
  const teamName = `Beacon Partners ${Date.now()}`;
  const slug = await completeTeamOnboarding(page, teamName);

  await page.goto(`/home/${slug}/members`);
  await expect(
    page.getByRole('button', { name: 'Send invitations' }),
  ).toBeVisible();

  // Invite the member by email, as the role 'member'.
  const invitee = newCredentials();
  const inviteForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Send invitations' }) });

  await inviteForm.getByPlaceholder('Email').fill(invitee.email);
  await inviteForm.getByRole('combobox').click();
  await page.getByRole('option', { name: 'member', exact: true }).click();
  await inviteForm.getByRole('button', { name: 'Send invitations' }).click();

  // The invitations list refetches on load; the invited email shows up there.
  await page.reload();
  await expect(page.getByRole('cell', { name: invitee.email })).toBeVisible();

  // The UI never exposes the invite token, so capture it from the DB.
  const invitations = await invitationByEmail(request, invitee.email);
  expect(invitations).toHaveLength(1);
  const { invite_token: token, account_id: accountId } = invitations[0]!;

  // Invitee: a fresh browser context, fresh signup + onboarding, then accept.
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();

  try {
    await signUp(inviteePage, invitee);
    await completePersonalOnboarding(inviteePage);

    await inviteePage.goto(`/join?token=${token}`);
    await inviteePage
      .getByRole('button', { name: 'Accept invitation' })
      .click();

    // Accept has no success redirect; wait for the membership to land.
    await expect
      .poll(
        async () => {
          const members = await membershipsForAccount(request, accountId);
          return members.some((member) => member.account_role === 'member');
        },
        { timeout: 20 * 1000 },
      )
      .toBe(true);

    // The invitee can now open the team workspace: proof they are a member.
    // The team "Home" index (/home/<slug>) crashes app-side (see report), so a
    // working workspace page is used; the sidebar carries the team name there.
    await inviteePage.goto(`/home/${slug}/members`);
    await expect(inviteePage).toHaveURL(new RegExp(`/home/${slug}(/|$)`));
    await expect(inviteePage.getByText(teamName).first()).toBeVisible();

    const members = await membershipsForAccount(request, accountId);
    expect(members).toHaveLength(2);
    expect(
      members.filter((member) => member.account_role === 'member'),
    ).toHaveLength(1);

    // A consumed invitation is deleted.
    expect(await invitationByEmail(request, invitee.email)).toHaveLength(0);
  } finally {
    await inviteeContext.close();
  }
});
