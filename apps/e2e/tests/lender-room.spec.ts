import {
  type APIRequestContext,
  type Browser,
  type Page,
  expect,
  test,
} from '@playwright/test';

import {
  SUPABASE_URL,
  completePersonalOnboarding,
  completeTeamOnboarding,
  newCredentials,
  serviceHeaders,
  signUp,
} from './fixtures/team';

const DATA_ROOM_BUCKET = 'data-room';

async function restRows<Row>(
  request: APIRequestContext,
  path: string,
): Promise<Row[]> {
  const response = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: serviceHeaders,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Row[];
}

async function userIdByEmail(request: APIRequestContext, email: string) {
  const rows = await restRows<{ primary_owner_user_id: string }>(
    request,
    `accounts?email=eq.${encodeURIComponent(email)}&is_personal_account=eq.true&select=primary_owner_user_id`,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.primary_owner_user_id;
}

async function documentIdByName(
  request: APIRequestContext,
  dealId: string,
  name: string,
): Promise<string> {
  const rows = await restRows<{ id: string }>(
    request,
    `dr_document?deal_id=eq.${dealId}&name=eq.${encodeURIComponent(name)}&select=id`,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

// The invite email carries a token-hash link to /auth/confirm; the same link is
// built here from a server-side admin magic link, as sign-in-link.ts does.
async function signInLink(
  request: APIRequestContext,
  { email, next }: { email: string; next: string },
): Promise<string> {
  const response = await request.post(
    `${SUPABASE_URL}/auth/v1/admin/generate_link`,
    { headers: serviceHeaders, data: { type: 'magiclink', email } },
  );
  expect(response.ok()).toBeTruthy();
  const { hashed_token: tokenHash } = (await response.json()) as {
    hashed_token: string;
  };

  return `/auth/confirm?${new URLSearchParams({
    token_hash: tokenHash,
    type: 'magiclink',
    next,
  })}`;
}

async function lenderActivity(
  request: APIRequestContext,
  roomId: string,
  userId: string,
) {
  return restRows<{ action: string; side: string; dr_document_id: string | null }>(
    request,
    `lender_room_activity?room_id=eq.${roomId}&user_id=eq.${userId}&select=action,side,dr_document_id`,
  );
}

async function documentsVisibleToLender(
  request: APIRequestContext,
  userId: string,
  documentIds: string[],
) {
  const response = await request.post(
    `${SUPABASE_URL}/rest/v1/rpc/lender_visible_documents`,
    {
      headers: serviceHeaders,
      data: { user_id: userId, document_ids: documentIds },
    },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { document_id: string }[];
}

async function createRoomByName(page: Page, openLabel: string, name: string) {
  await page.getByRole('button', { name: openLabel }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a lender room' });
  await dialog.getByLabel('Lender name').fill(name);
  await dialog.getByRole('button', { name: 'Create room' }).click();
  await page.waitForURL(/\/lenders\/[0-9a-f-]{36}\?tab=people$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function cleanUp(
  request: APIRequestContext,
  {
    dealId,
    teamSlug,
    emails,
  }: { dealId: string | null; teamSlug: string; emails: string[] },
) {
  if (dealId) {
    const listed = await request.post(
      `${SUPABASE_URL}/storage/v1/object/list/${DATA_ROOM_BUCKET}`,
      {
        headers: serviceHeaders,
        data: { prefix: `deal/${dealId}`, limit: 1000 },
      },
    );
    expect(listed.ok()).toBeTruthy();
    const objects = (await listed.json()) as { name: string }[];

    if (objects.length > 0) {
      const removed = await request.delete(
        `${SUPABASE_URL}/storage/v1/object/${DATA_ROOM_BUCKET}`,
        {
          headers: serviceHeaders,
          data: {
            prefixes: objects.map((object) => `deal/${dealId}/${object.name}`),
          },
        },
      );
      expect(removed.ok()).toBeTruthy();
    }
  }

  const teamDeleted = await request.delete(
    `${SUPABASE_URL}/rest/v1/accounts?slug=eq.${teamSlug}`,
    { headers: serviceHeaders },
  );
  expect(teamDeleted.ok()).toBeTruthy();

  for (const email of emails) {
    await request.delete(
      `${SUPABASE_URL}/rest/v1/lender_rate_limit?key=like.*${encodeURIComponent(email)}*`,
      { headers: serviceHeaders },
    );

    const [account] = await restRows<{ primary_owner_user_id: string }>(
      request,
      `accounts?email=eq.${encodeURIComponent(email)}&is_personal_account=eq.true&select=primary_owner_user_id`,
    );

    if (account) {
      const userId = account.primary_owner_user_id;
      const accountDeleted = await request.delete(
        `${SUPABASE_URL}/rest/v1/accounts?id=eq.${userId}`,
        { headers: serviceHeaders },
      );
      expect(accountDeleted.ok()).toBeTruthy();
      const userDeleted = await request.delete(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
        { headers: serviceHeaders },
      );
      expect(userDeleted.ok()).toBeTruthy();
    }
  }
}

// Membership is seeded rather than invited: the invite-join flow is covered
// by invite-join.spec.ts, and only the plain member role matters here.
async function addTeamMember(
  request: APIRequestContext,
  { teamSlug, userId }: { teamSlug: string; userId: string },
) {
  const [teamAccount] = await restRows<{ id: string }>(
    request,
    `accounts?slug=eq.${teamSlug}&select=id`,
  );
  const added = await request.post(
    `${SUPABASE_URL}/rest/v1/accounts_memberships`,
    {
      headers: serviceHeaders,
      data: {
        account_id: teamAccount!.id,
        user_id: userId,
        account_role: 'member',
      },
    },
  );
  expect(added.ok()).toBeTruthy();
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const team = newCredentials();
const lender = {
  email: newCredentials().email,
  name: `Lena Lender ${Date.now()}`,
};
const outsider = newCredentials();
const teamName = `Lender Room Team ${Date.now()}`;
let teamSlug = '';
let dealId: string | null = null;

// The team account goes first: removing it removes the deal, its rooms, and
// every row the lender's actions left behind.
test.afterEach(async ({ request }) => {
  await cleanUp(request, {
    dealId,
    teamSlug,
    emails: [team.email, lender.email, outsider.email],
  });
});

test('lender room journey: invite, sign in, browse, request, track, hide, close', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(600 * 1000);

  const stamp = Date.now();
  const dealDescription = `Lender Room Deal ${stamp}`;
  const decoyRoomName = `Quiet Bank ${stamp}`;
  const roomName = `Harbor Lending ${stamp}`;
  const masterName = `teaser-${stamp}.txt`;
  const masterText = `Confidential teaser body ${stamp}`;
  const requestTitle = `Three years of tax returns ${stamp}`;
  const replyText = `Uploaded them this morning ${stamp}`;
  const folderName = `Credit memos ${stamp}`;
  const lenderFileName = `term-sheet-${stamp}.txt`;
  const removedName = `old-rates-${stamp}.txt`;
  const lenderLabel = `${lender.name} (${lender.email})`;

  const lenderSide = await freshPage(browser);
  const outsiderSide = await freshPage(browser);

  // 1. Deal team: sign up into a team, create a team deal, start the lender
  // package and add two files to it, create two rooms by typed name, invite
  // a named lender person into the second.
  await signUp(page, team);
  teamSlug = await completeTeamOnboarding(page, teamName);

  await page.goto(`/home/${teamSlug}/deals/new`);
  await page.getByLabel('Description').fill(dealDescription);
  await page.getByRole('button', { name: 'Create deal' }).click();
  await page.waitForURL(
    new RegExp(`/home/${teamSlug}/deals/[0-9a-f-]{36}$`),
  );
  dealId = new URL(page.url()).pathname.split('/').pop()!;
  const dealPath = `/home/${teamSlug}/deals/${dealId}`;
  const lendersPath = `${dealPath}/lenders`;

  await page.locator(`a[href="${lendersPath}"]`).click();
  await page.waitForURL(lendersPath);
  await expect(
    page.getByRole('heading', { name: 'No lender rooms yet' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Start the lender package' }).click();
  await page.getByLabel('Add files', { exact: true }).setInputFiles([
    {
      name: masterName,
      mimeType: 'text/plain',
      buffer: Buffer.from(masterText),
    },
    {
      name: removedName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`Superseded rates ${stamp}`),
    },
  ]);
  await expect(
    page.getByRole('link', { name: `Download ${masterName}` }),
  ).toBeVisible({ timeout: 30 * 1000 });
  await expect(
    page.getByRole('link', { name: `Download ${removedName}` }),
  ).toBeVisible({ timeout: 30 * 1000 });
  const masterId = await documentIdByName(request, dealId, masterName);

  await createRoomByName(page, 'Create the first lender room', decoyRoomName);
  await page.goto(lendersPath);
  const roomId = await createRoomByName(page, 'Create lender room', roomName);
  const roomPath = `${lendersPath}/${roomId}`;

  await expect(page.getByRole('tab', { name: 'People (0)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByLabel('Email').fill(lender.email);
  await page.getByLabel('Name (optional)').fill(lender.name);
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(page.getByText(lenderLabel)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'People (1)' })).toBeVisible();

  // 2. Lender: open the emailed sign-in link in a fresh browser and continue.
  const lenderPage = lenderSide.page;
  await lenderPage.goto(
    await signInLink(request, {
      email: lender.email,
      next: `/lender/${roomId}`,
    }),
  );
  await lenderPage
    .getByRole('button', { name: 'Continue to your lender room' })
    .click();
  await lenderPage.waitForURL(new RegExp(`/lender/${roomId}$`));
  const lenderUserId = await userIdByEmail(request, lender.email);

  // 3. Lender: header, deal, notice; preview and download the master file;
  // open a request; make a folder in "Your files" and upload into it.
  await expect(
    lenderPage.getByRole('heading', { name: new RegExp(roomName) }),
  ).toBeVisible();
  await expect(
    lenderPage
      .getByRole('region', { name: 'People in this room' })
      .getByText(`${lender.name} (you)`),
  ).toBeVisible();
  await expect(lenderPage.getByText(dealDescription)).toBeVisible();
  await expect(
    lenderPage.getByText(
      'Views and downloads in this room are recorded for the deal team.',
    ),
  ).toBeVisible();

  await expect(
    lenderPage.getByRole('button', { name: removedName, exact: true }),
  ).toBeVisible();
  await lenderPage.getByRole('button', { name: masterName, exact: true }).click();
  const preview = lenderPage.getByRole('dialog', {
    name: `Preview of ${masterName}`,
  });
  await expect(preview.getByText(masterText)).toBeVisible();
  await preview.getByRole('button', { name: 'Close' }).click();
  await expect(preview).toBeHidden();

  const downloading = lenderPage.waitForEvent('download');
  await lenderPage.getByRole('link', { name: `Download ${masterName}` }).click();
  expect((await downloading).suggestedFilename()).toBe(masterName);

  await lenderPage.getByRole('button', { name: 'Request something' }).click();
  const composer = lenderPage.getByRole('dialog', { name: 'Request something' });
  await composer
    .getByRole('textbox', { name: 'What do you need from the deal team?' })
    .fill(requestTitle);
  await composer.getByRole('button', { name: 'Send request' }).click();
  await expect(composer).toBeHidden();

  const folders = lenderPage.getByRole('navigation', { name: 'Folders' });
  await folders.getByRole('button', { name: 'Your files' }).click();
  await lenderPage.getByRole('button', { name: 'New folder' }).first().click();
  const folderDialog = lenderPage.getByRole('dialog', { name: 'New folder' });
  await folderDialog.getByLabel('Folder name').fill(folderName);
  await folderDialog.getByRole('button', { name: 'Create folder' }).click();
  await expect(folderDialog).toBeHidden();

  await folders.getByRole('button', { name: folderName }).click();
  await expect(
    lenderPage
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByText(folderName),
  ).toBeVisible();
  await lenderPage.getByLabel('Add files', { exact: true }).setInputFiles({
    name: lenderFileName,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Our draft terms ${stamp}`),
  });
  await expect(
    lenderPage.getByRole('button', { name: lenderFileName, exact: true }),
  ).toBeVisible({ timeout: 30 * 1000 });

  // 4. Deal team: activity, seen-by, overview order, and the rows behind them.
  await page.goto(`${roomPath}?tab=activity`);
  const activityRow = (action: string, item: string) =>
    page
      .getByRole('row')
      .filter({ hasText: lenderLabel })
      .filter({ hasText: action })
      .filter({ hasText: item });
  await expect(activityRow('Previewed', masterName)).toBeVisible();
  await expect(activityRow('Downloaded', masterName)).toBeVisible();
  await expect(activityRow('Opened a request', requestTitle)).toBeVisible();
  await expect(activityRow('Created folder', folderName)).toBeVisible();
  await expect(activityRow('Uploaded a file', lenderFileName)).toBeVisible();

  const recorded = await lenderActivity(request, roomId, lenderUserId);
  expect(recorded).toEqual(
    expect.arrayContaining([
      { action: 'document_previewed', side: 'lender', dr_document_id: masterId },
      { action: 'document_downloaded', side: 'lender', dr_document_id: masterId },
      expect.objectContaining({ action: 'folder_created', side: 'lender' }),
    ]),
  );
  const asks = await restRows<{ title: string; status: string }>(
    request,
    `lender_ask?room_id=eq.${roomId}&select=title,status`,
  );
  expect(asks).toEqual([{ title: requestTitle, status: 'open' }]);
  const lenderUploads = await restRows<{ name: string }>(
    request,
    `dr_document?deal_id=eq.${dealId}&uploaded_by=eq.${lenderUserId}&select=name`,
  );
  expect(lenderUploads).toEqual([{ name: lenderFileName }]);
  expect(
    await documentsVisibleToLender(request, lenderUserId, [masterId]),
  ).toHaveLength(1);

  await page.getByRole('tab', { name: 'Files' }).click();
  const masterRow = page.locator(`[data-entry="${masterName}"]`);
  await expect(masterRow.getByText(lenderLabel)).toBeVisible();
  await expect(masterRow.getByText('Not seen by the lender yet')).toHaveCount(0);

  await page.goto(lendersPath);
  const firstRoom = page.getByRole('main').getByRole('listitem').first();
  await expect(firstRoom.getByRole('link', { name: roomName })).toBeVisible();
  await expect(firstRoom.getByText('1 request waiting on us')).toBeVisible();

  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Lenders', exact: true })
    .click();
  await page.waitForURL(`/home/${teamSlug}/lenders`);
  const roomRow = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: roomName }) });
  await expect(roomRow.getByText(dealDescription)).toBeVisible();

  await page.getByRole('link', { name: 'Contacts', exact: true }).click();
  await page.waitForURL(`/home/${teamSlug}/lenders/contacts`);
  const contactRow = page.getByRole('row').filter({ hasText: lenderLabel });
  await expect(contactRow.getByText('1 request opened')).toBeVisible();
  await expect(contactRow.getByText('First visit')).toBeVisible();
  await expect(contactRow.getByRole('link', { name: roomName })).toBeVisible();

  // 5. Deal team replies; the lender sees it as their turn, with the reply.
  await page.goto(`${roomPath}?tab=requests`);
  await page.getByRole('link', { name: requestTitle }).click();
  const replyBox = page.getByLabel('Reply', { exact: true });
  await replyBox.fill(replyText);
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(replyBox).toHaveValue('');
  await expect(page.getByText(replyText)).toBeVisible();

  await lenderPage.goto(`/lender/${roomId}/requests`);
  const requestLink = lenderPage.getByRole('link', { name: requestTitle });
  await expect(requestLink.getByText('Answered, your turn')).toBeVisible();
  await requestLink.click();
  await expect(lenderPage.getByText(replyText)).toBeVisible();

  // 6. Deal team hides the master file and removes a second package file,
  // then closes the room.
  await page.goto(`${roomPath}?tab=files`);
  await page
    .getByRole('button', { name: `Hide ${masterName} from this lender` })
    .click();
  await expect(
    page.locator(`[data-entry="${masterName}"]`).getByText('Hidden from this lender'),
  ).toBeVisible();
  expect(
    await documentsVisibleToLender(request, lenderUserId, [masterId]),
  ).toHaveLength(0);

  await lenderPage.goto(`/lender/${roomId}`);
  await expect(
    lenderPage.getByRole('heading', { name: new RegExp(roomName) }),
  ).toBeVisible();
  await expect(lenderPage.getByText(masterName)).toHaveCount(0);
  await expect(
    lenderPage.getByRole('button', { name: removedName, exact: true }),
  ).toBeVisible();

  await page.goto(lendersPath);
  await page.getByRole('button', { name: `Remove ${removedName}` }).click();
  const removeDialog = page.getByRole('dialog', {
    name: `Remove ${removedName} from the lender package?`,
  });
  await removeDialog.getByRole('button', { name: 'Remove file' }).click();
  await expect(removeDialog).toBeHidden();
  await expect(page.getByText(removedName)).toHaveCount(0);

  await lenderPage.reload();
  await expect(
    lenderPage.getByRole('heading', { name: new RegExp(roomName) }),
  ).toBeVisible();
  await expect(lenderPage.getByText(removedName)).toHaveCount(0);

  await page.goto(`${roomPath}?tab=settings`);
  await page.getByRole('tab', { name: 'Status and access' }).click();
  await page.getByRole('button', { name: 'Close room' }).click();
  await page.getByRole('button', { name: 'Close this room' }).click();
  await expect(page.getByRole('button', { name: 'Reopen room' })).toBeVisible();

  await lenderPage.reload();
  await expect(lenderPage.getByText('This room is closed.')).toBeVisible();
  await expect(
    lenderPage.getByRole('link', { name: team.email }),
  ).toHaveAttribute('href', `mailto:${team.email}`);
  await expect(lenderPage.getByText(masterName)).toHaveCount(0);
  await expect(lenderPage.getByText(lenderFileName)).toHaveCount(0);
  await expect(lenderPage.getByText(folderName)).toHaveCount(0);

  // 7. An unrelated signed-in user gets not-found and no Lenders tab; made a
  // plain team member (no deals.manage), they see the deal but still no tab.
  const outsiderPage = outsiderSide.page;
  await signUp(outsiderPage, outsider);
  await completePersonalOnboarding(outsiderPage);

  const roomResponse = await outsiderPage.goto(`/lender/${roomId}`);
  expect(roomResponse!.status()).toBe(404);
  await expect(outsiderPage.getByText(roomName)).toHaveCount(0);

  await outsiderPage.goto(dealPath);
  await expect(
    outsiderPage.getByRole('link', { name: 'Lenders', exact: true }),
  ).toHaveCount(0);
  expect((await outsiderPage.goto(lendersPath))!.status()).toBe(404);

  await addTeamMember(request, {
    teamSlug,
    userId: await userIdByEmail(request, outsider.email),
  });
  await outsiderPage.goto(dealPath);
  await expect(outsiderPage.getByText(dealDescription).first()).toBeVisible();
  await expect(
    outsiderPage.getByRole('link', { name: 'Lenders', exact: true }),
  ).toHaveCount(0);
  expect((await outsiderPage.goto(lendersPath))!.status()).toBe(404);
  expect((await outsiderPage.goto(`/lender/${roomId}`))!.status()).toBe(404);

  await outsiderPage.goto(`/home/${teamSlug}/deals`);
  await expect(
    outsiderPage.getByRole('complementary').getByRole('link', { name: 'Deals', exact: true }),
  ).toBeVisible();
  await expect(
    outsiderPage
      .getByRole('complementary')
      .getByRole('link', { name: 'Lenders', exact: true }),
  ).toHaveCount(0);
  expect(
    (await outsiderPage.goto(`/home/${teamSlug}/lenders`))!.status(),
  ).toBe(404);

  await lenderSide.context.close();
  await outsiderSide.context.close();
});
