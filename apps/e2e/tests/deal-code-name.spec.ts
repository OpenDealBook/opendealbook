import {
  completeTeamOnboarding,
  db,
  expect,
  newCredentials,
  test,
} from './fixtures';
import { createDeal } from './fixtures/deal';
import { gmail } from './fixtures/stand-ins';

const team = newCredentials();

test('a code name replaces the business name in what lenders are sent', async ({
  page,
  auth,
  cleanup,
}) => {
  test.setTimeout(120 * 1000);

  const stamp = Date.now();
  const businessName = `Cedar Plumbing ${stamp}`;
  const codeName = `Project Kestrel ${stamp}`;
  const lender = {
    name: `Harbor Bank ${stamp}`,
    domain: `harbor-${stamp}.test`,
    contact: `Lena Lender ${stamp}`,
    email: newCredentials().email,
  };
  const teamName = `Code Name Team ${stamp}`;

  await auth.signUp(page, team);
  const teamSlug = await completeTeamOnboarding(page, teamName);
  const { dealId, dealPath } = await createDeal(page, teamSlug, businessName);
  cleanup.track({ kind: 'storage', bucket: 'data-room', prefix: `deal/${dealId}` });

  await page.getByRole('button', { name: 'Deal profile' }).click();
  const profile = page.getByRole('dialog', { name: 'Deal profile' });
  await profile.getByLabel('Code name').fill(codeName);
  await profile.getByRole('button', { name: 'Save profile' }).click();
  await expect(profile).toBeHidden();
  await expect(page.getByTitle('Code name', { exact: true })).toHaveText(codeName);

  await page.goto(`/home/${teamSlug}/lenders/saved`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Add lender' }).click();
  const form = page.getByRole('dialog', { name: 'Add a lender' });
  await form.getByLabel('Lender name').fill(lender.name);
  await form.getByLabel('Website').fill(lender.domain);
  await form.getByRole('button', { name: 'Save lender' }).click();
  await expect(form).toBeHidden();
  const saved = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: lender.name, exact: true }) })
    .first();
  await saved.getByRole('button', { name: `Add contact to ${lender.name}` }).click();
  const contact = page.getByRole('dialog', { name: `Add a contact at ${lender.name}` });
  await contact.getByLabel('Contact name').fill(lender.contact);
  await contact.getByLabel('Email').fill(lender.email);
  await contact.getByRole('button', { name: 'Save contact' }).click();
  await expect(contact).toBeHidden();
  await saved.getByRole('button', { name: `Make ${lender.contact} primary` }).click();
  await expect(saved.getByText('Primary', { exact: true })).toBeVisible();

  await page.goto(`${dealPath}/lenders`);
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  const reason = `Seller retires after harvest ${stamp}`;
  await page.getByLabel('Must close by').fill('2027-03-31');
  await page.getByLabel('Why that date').fill(reason);
  await page.getByRole('button', { name: 'Save deadline' }).click();
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  cleanup.track({ kind: 'user', email: lender.email });
  await page.getByRole('checkbox', { name: new RegExp(lender.name) }).check();
  await page.getByRole('button', { name: 'Set up 1 room' }).click();
  await expect
    .poll(
      async () =>
        (await db.rows('lender_room', `deal_id=eq.${dealId}&select=id`)).length,
    )
    .toBe(1);

  const [account] = await db.rows<{ id: string }>(
    'accounts',
    `slug=eq.${teamSlug}&select=id`,
  );
  await db.insert('mailbox_connection', {
    account_id: account!.id,
    user_id: await db.userIdByEmail(team.email),
    provider: 'gmail',
    nango_connection_id: `e2e-mailbox-${stamp}`,
    provider_config_key: 'google-mail',
    email_address: team.email,
    status: 'active',
  });

  await page.reload();
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Draft outreach' }).click();
  const drafted = page.getByLabel(`Subject for ${lender.name}`);
  await expect(drafted).toHaveValue(new RegExp(`^${codeName}: financing with `));
  await expect(drafted).not.toHaveValue(new RegExp(businessName));
  const subject = await drafted.inputValue();
  const body = await page.getByLabel(`Message to ${lender.name}`).inputValue();
  expect(body).not.toContain(`${businessName} description`);
  expect(body).not.toContain(reason);
  await page.getByRole('button', { name: `Send to ${lender.name}` }).click();
  await expect(page.getByText(`Sent to ${lender.email}`)).toBeVisible();

  const message = (await gmail.sent()).find((sent) =>
    sent.mime.includes(`To: ${lender.email}`),
  );
  expect(message).toBeDefined();
  expect(message!.mime).toContain(`Subject: ${subject}`);
  expect(message!.mime).not.toContain(businessName);
});
