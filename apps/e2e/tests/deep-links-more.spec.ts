import type { Browser } from '@playwright/test';

import {
  card,
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';
import { waitForMessageContaining } from './fixtures/mail';

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function noticeLink(userId: string, like: string): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const rows = await db.rows<{ link: string | null }>(
          'notifications',
          `recipient_user_id=eq.${userId}&link=like.${encodeURIComponent(like)}&select=link`,
        );
        link = rows[0]?.link ?? '';
        return link;
      },
      { timeout: 60 * 1000, message: `a notice linking ${like}` },
    )
    .not.toBe('');
  return link;
}

test('must close by on the team home goes to the lenders tab for a manager', async ({
  page,
  auth,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const reason = `Seller retires ${stamp}`;
  const mustCloseBy = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await auth.signUp(page);
  const teamSlug = await completeTeamOnboarding(page, `Close Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Close Deal ${stamp}`);

  await page.goto(`${dealPath}/lenders`);
  await page.getByLabel('Must close by').fill(mustCloseBy);
  await page.getByLabel('Why that date').fill(reason);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save deadline' }).click(),
  ]);

  await page.goto(`/home/${teamSlug}`);
  const managerLink = page.getByRole('link', { name: `Must close by: ${reason}` });
  await expect(managerLink).toHaveAttribute('href', `${dealPath}/lenders#must-close-by-${dealId}`);

});

test('counsel messages, contract comments, review requests and invitations deep link to their item', async ({
  page,
  browser,
  auth,
  cleanup,
  counsel,
  contracts,
}) => {
  test.setTimeout(180 * 1000);

  const stamp = Date.now();
  const counselPerson = { email: newCredentials().email, name: `Bea Counsel ${stamp}` };
  const owner = newCredentials();
  await auth.signUp(page, owner);
  const teamSlug = await completeTeamOnboarding(page, `Link Team ${stamp}`);
  const { dealId, dealPath } = await createDeal(page, teamSlug, `Link Deal ${stamp}`);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });
  const [versionId] = await contracts.seed({
    dealId,
    versions: [{ party: 'buyer', summary: `Draft ${stamp}`, shared: true }],
  });
  const ownerId = await db.userIdByEmail(owner.email);

  await page.goto(`${dealPath}/parties`);
  await counsel.inviteBuyerCounsel(page, counselPerson);
  const counselSide = await freshPage(browser);
  await counsel.signIn(counselSide.page, { email: counselPerson.email, dealId });

  const message = `Counsel question ${stamp}`;
  await counselSide.page.goto(`/counsel/${dealId}/messages`);
  await counselSide.page.getByLabel('Message').fill(message);
  await counselSide.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(counselSide.page.getByText(message)).toBeVisible();
  const messageLink = await noticeLink(ownerId, '%/parties#counsel-message-%');
  expect(messageLink).toMatch(new RegExp(`${dealPath}/parties#counsel-message-[0-9a-f-]{36}$`));
  await page.goto(messageLink);
  await expect(page.locator(`#${messageLink.split('#')[1]}`)).toBeVisible();

  const comment = `Please resolve ${stamp}`;
  await counselSide.page.goto(`/counsel/${dealId}/contracts`);
  const theirs = card(counselSide.page, 'LOI');
  const newComment = theirs.locator('[data-new-comment]').last();
  await newComment.getByLabel('Comment', { exact: true }).fill(comment);
  await newComment.getByRole('button', { name: 'Post comment' }).click();
  await expect(theirs.getByText(comment)).toBeVisible();
  await theirs.getByRole('button', { name: 'Resolve' }).click();
  const commented = await waitForMessageContaining({
    to: owner.email,
    text: `${dealPath}/documents#contract-comment-`,
  });
  const commentLink = /\/home\/[^"\s<>]*\/documents#contract-comment-[0-9a-f-]{36}/.exec(
    commented.html + commented.text,
  )![0];
  await page.goto(commentLink);
  await expect(page.getByText(comment)).toBeVisible();

  await page.goto(`${dealPath}/documents`);
  await page
    .locator('[data-version-review]')
    .first()
    .getByRole('button', { name: 'Ask counsel to review' })
    .click();
  const requested = await waitForMessageContaining({
    to: counselPerson.email,
    text: `/counsel/${dealId}/contracts#contract-review-${versionId}`,
  });
  expect(requested.html + requested.text).not.toContain('/home/');
  await counselSide.page.goto(`/counsel/${dealId}/contracts#contract-review-${versionId}`);
  await expect(counselSide.page.locator(`#contract-review-${versionId}`)).toBeVisible();

  const invited = newCredentials();
  const inviteeSide = await freshPage(browser);
  await auth.signUp(inviteeSide.page, invited);
  await page.goto(`/home/${teamSlug}/members`);
  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Send invitations' }) });
  await form.getByPlaceholder('Email').fill(invited.email);
  await form.getByRole('button', { name: 'Send invitations' }).click();
  const joinLink = await noticeLink(await db.userIdByEmail(invited.email), '%/join?token=%');
  expect(joinLink).toMatch(/\/join\?token=[0-9a-f-]+$/);

  await counselSide.context.close();
  await inviteeSide.context.close();
});
