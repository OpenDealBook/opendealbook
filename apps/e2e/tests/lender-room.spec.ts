import type { Browser, Page } from '@playwright/test';

import {
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';

const DATA_ROOM_BUCKET = 'data-room';

async function documentIdByName(dealId: string, name: string): Promise<string> {
  const rows = await db.rows<{ id: string }>(
    'dr_document',
    `deal_id=eq.${dealId}&name=eq.${encodeURIComponent(name)}&select=id`,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.id;
}

function lenderActivity(roomId: string, userId: string) {
  return db.rows<{
    action: string;
    side: string;
    dr_document_id: string | null;
  }>(
    'lender_room_activity',
    `room_id=eq.${roomId}&user_id=eq.${userId}&select=action,side,dr_document_id`,
  );
}

function documentsVisibleToLender(userId: string, documentIds: string[]) {
  return db.rpc<{ document_id: string }[]>('lender_visible_documents', {
    user_id: userId,
    document_ids: documentIds,
  });
}

async function createRoomByName(page: Page, openLabel: string, name: string) {
  await page.getByRole('button', { name: openLabel }).click();
  const dialog = page.getByRole('dialog', { name: 'Create a lender room' });
  await dialog.getByLabel('Lender name').fill(name);
  await dialog.getByRole('button', { name: 'Create room' }).click();
  await page.waitForURL(/\/lenders\/[0-9a-f-]{36}\?tab=people$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

// Membership is seeded rather than invited: the invite-join flow is covered
// by invite-join.spec.ts, and only the plain member role matters here.
async function addTeamMember({
  teamSlug,
  userId,
}: {
  teamSlug: string;
  userId: string;
}) {
  const [teamAccount] = await db.rows<{ id: string }>(
    'accounts',
    `slug=eq.${teamSlug}&select=id`,
  );
  await db.insert('accounts_memberships', {
    account_id: teamAccount!.id,
    user_id: userId,
    account_role: 'member',
  });
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

test('lender room journey: invite, sign in, browse, request, track, hide, close', async ({
  page,
  browser,
  auth,
  cleanup,
  lender: lenderFlow,
}) => {
  test.setTimeout(240 * 1000);

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
  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, teamName);

  const { dealId } = await createDeal(page, teamSlug, dealDescription);
  cleanup.track({
    kind: 'storage',
    bucket: DATA_ROOM_BUCKET,
    prefix: `deal/${dealId}`,
  });
  const dealPath = `/home/${teamSlug}/deals/${dealId}`;
  const lendersPath = `${dealPath}/lenders`;

  await page.goto(lendersPath);
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
  const masterId = await documentIdByName(dealId, masterName);

  await createRoomByName(page, 'Create the first lender room', decoyRoomName);
  await page.goto(lendersPath);
  const roomId = await createRoomByName(page, 'Create lender room', roomName);
  const roomPath = `${lendersPath}/${roomId}`;

  await expect(page.getByRole('tab', { name: 'People (0)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await lenderFlow.invite(page, { email: lender.email, name: lender.name });
  await expect(page.getByText(lenderLabel)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'People (1)' })).toBeVisible();

  // 2. Lender: open the emailed sign-in link in a fresh browser and continue.
  const lenderPage = lenderSide.page;
  await lenderFlow.signIn(lenderPage, { email: lender.email, roomId });
  const lenderUserId = await db.userIdByEmail(lender.email);

  // 3. Lender: header, deal, notice; preview and download the master file;
  // open a request; make a folder in "Your files" and upload into it.
  await expect(
    lenderPage.getByText(`Prepared for ${roomName}`),
  ).toBeVisible();
  await expect(
    lenderPage
      .getByRole('region', { name: 'People in this room' })
      .getByText(`${lender.name} (you)`),
  ).toBeVisible();
  await expect(
    lenderPage.getByRole('heading', { name: dealDescription, level: 1 }),
  ).toBeVisible();
  await expect(
    lenderPage.getByText(
      `Views and downloads in this room are recorded for ${dealDescription}'s team.`,
    ),
  ).toBeVisible();

  await expect(
    lenderPage.getByRole('button', { name: removedName, exact: true }),
  ).toBeVisible();
  await lenderPage
    .getByRole('button', { name: masterName, exact: true })
    .click();
  const preview = lenderPage.getByRole('dialog', {
    name: `Preview of ${masterName}`,
  });
  await expect(preview.getByText(masterText)).toBeVisible();
  await preview.getByRole('button', { name: 'Close' }).click();
  await expect(preview).toBeHidden();

  const downloading = lenderPage.waitForEvent('download');
  await lenderPage
    .getByRole('link', { name: `Download ${masterName}` })
    .click();
  expect((await downloading).suggestedFilename()).toBe(masterName);

  await lenderPage.getByRole('button', { name: 'Request something' }).click();
  const composer = lenderPage.getByRole('dialog', {
    name: 'Request something',
  });
  await composer
    .getByRole('textbox', { name: /^What do you need from/ })
    .fill(requestTitle);
  await composer.getByRole('button', { name: 'Send request' }).click();
  await expect(composer).toBeHidden();

  await expect(async () => {
    await page.goto(`/home/${teamSlug}`);
    await page.locator('button:has(svg.lucide-bell)').click();
    await expect(
      page.getByRole('link', { name: `${roomName} made a new request on ${dealDescription}` }),
    ).toHaveAttribute('href', new RegExp(`/lenders/${roomId}/requests/asks/[0-9a-f-]{36}$`), {
      timeout: 4000,
    });
  }).toPass({ timeout: 60 * 1000 });

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

  const recorded = await lenderActivity(roomId, lenderUserId);
  expect(recorded).toEqual(
    expect.arrayContaining([
      {
        action: 'document_previewed',
        side: 'lender',
        dr_document_id: masterId,
      },
      {
        action: 'document_downloaded',
        side: 'lender',
        dr_document_id: masterId,
      },
      expect.objectContaining({ action: 'folder_created', side: 'lender' }),
    ]),
  );
  const asks = await db.rows<{ title: string; status: string }>(
    'lender_ask',
    `room_id=eq.${roomId}&select=title,status`,
  );
  expect(asks).toEqual([{ title: requestTitle, status: 'open' }]);
  const lenderUploads = await db.rows<{ name: string }>(
    'dr_document',
    `deal_id=eq.${dealId}&uploaded_by=eq.${lenderUserId}&select=name`,
  );
  expect(lenderUploads).toEqual([{ name: lenderFileName }]);
  expect(await documentsVisibleToLender(lenderUserId, [masterId])).toHaveLength(
    1,
  );

  await page.getByRole('tab', { name: 'Files' }).click();
  const masterRow = page.locator(`[data-entry="${masterName}"]`);
  await expect(masterRow.getByText(lenderLabel)).toBeVisible();
  await expect(masterRow.getByText('Not seen by the lender yet')).toHaveCount(
    0,
  );

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
    page
      .locator(`[data-entry="${masterName}"]`)
      .getByText('Hidden from this lender'),
  ).toBeVisible();
  expect(await documentsVisibleToLender(lenderUserId, [masterId])).toHaveLength(
    0,
  );

  await lenderPage.goto(`/lender/${roomId}`);
  await expect(
    lenderPage.getByText(`Prepared for ${roomName}`),
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
    lenderPage.getByText(`Prepared for ${roomName}`),
  ).toBeVisible();
  await expect(lenderPage.getByText(removedName)).toHaveCount(0);

  await page.goto(`${roomPath}?tab=settings`);
  await page.getByRole('tab', { name: 'Status and access' }).click();
  await page.getByRole('button', { name: 'Close room' }).click();
  const closingTodo = `Tell ${roomName} the room is closing`;
  await expect(async () => {
    await page.goto(`${dealPath}/todos`);
    await page
      .getByRole('listitem')
      .filter({ hasText: closingTodo })
      .getByRole('checkbox')
      .click({ timeout: 3000 });
  }).toPass({ timeout: 60 * 1000 });
  await expect(
    page.getByRole('listitem').filter({ hasText: closingTodo }).getByRole('checkbox'),
  ).toBeChecked();
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
  await auth.signUp(outsiderPage, outsider);
  await completeTeamOnboarding(outsiderPage, `Outsider Team ${Date.now()}`);

  const roomResponse = await outsiderPage.goto(`/lender/${roomId}`);
  expect(roomResponse!.status()).toBe(404);
  await expect(outsiderPage.getByText(roomName)).toHaveCount(0);

  await outsiderPage.goto(dealPath);
  await expect(
    outsiderPage.getByRole('link', { name: 'Lenders', exact: true }),
  ).toHaveCount(0);
  expect((await outsiderPage.goto(lendersPath))!.status()).toBe(404);

  await addTeamMember({
    teamSlug,
    userId: await db.userIdByEmail(outsider.email),
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
    outsiderPage
      .getByRole('complementary')
      .getByRole('link', { name: 'Deals', exact: true }),
  ).toBeVisible();
  await expect(
    outsiderPage
      .getByRole('complementary')
      .getByRole('link', { name: 'Lenders', exact: true }),
  ).toHaveCount(0);
  expect((await outsiderPage.goto(`/home/${teamSlug}/lenders`))!.status()).toBe(
    404,
  );

  await lenderSide.context.close();
  await outsiderSide.context.close();
});
