import {
  completeInviteeOnboarding,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';

function membershipsForAccount(accountId: string) {
  return db.rows<{ user_id: string; account_role: string }>(
    'accounts_memberships',
    `account_id=eq.${accountId}&select=user_id,account_role`,
  );
}

function invitationByEmail(email: string) {
  return db.rows<{ invite_token: string; account_id: string; role: string }>(
    'invitations',
    `email=eq.${encodeURIComponent(email)}&select=invite_token,account_id,role`,
  );
}

test('an invited member joins the team from the invite link', async ({
  page,
  browser,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  // Owner: fresh signup, onboard as a team, open the members page.
  await auth.signUp(page);
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
  await page.getByRole('option', { name: 'Team member', exact: true }).click();
  await inviteForm.getByRole('button', { name: 'Send invitations' }).click();

  // The invitations list refetches on load; the invited email shows up there.
  await page.reload();
  await expect(page.getByRole('cell', { name: invitee.email })).toBeVisible();

  // The UI never exposes the invite token, so capture it from the DB.
  const invitations = await invitationByEmail(invitee.email);
  expect(invitations).toHaveLength(1);
  const { invite_token: token, account_id: accountId } = invitations[0]!;

  // Invitee: a fresh browser context, fresh signup + onboarding, then accept.
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();

  try {
    await auth.signUp(inviteePage, invitee);
    await inviteePage.goto(`/join?token=${token}`);
    await inviteePage
      .getByRole('button', { name: 'Accept invitation' })
      .click();

    // Accept has no success redirect; wait for the membership to land.
    await expect
      .poll(
        async () => {
          const members = await membershipsForAccount(accountId);
          return members.some((member) => member.account_role === 'member');
        },
        { timeout: 20 * 1000 },
      )
      .toBe(true);

    await completeInviteeOnboarding(inviteePage, slug);
    await inviteePage.goto(`/home/${slug}/members`);
    await expect(inviteePage).toHaveURL(new RegExp(`/home/${slug}(/|$)`));
    await expect(inviteePage.getByText(teamName).first()).toBeVisible();

    const members = await membershipsForAccount(accountId);
    expect(members).toHaveLength(2);
    expect(
      members.filter((member) => member.account_role === 'member'),
    ).toHaveLength(1);

    // A consumed invitation is deleted.
    expect(await invitationByEmail(invitee.email)).toHaveLength(0);
  } finally {
    await inviteeContext.close();
  }
});
