import {
  completeTeamOnboarding,
  db,
  expect,
  firstLink,
  newCredentials,
  standIns,
  test,
  waitForMessage,
} from './fixtures';
import { settle } from './fixtures/cleanup';
import { MAILPIT_URL, SUPABASE_URL, serviceHeaders } from './fixtures/stack';

async function sendThroughMailpit(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const response = await fetch(`${MAILPIT_URL}/api/v1/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      From: { Email: 'fixtures@e2e.test' },
      To: [{ Email: message.to }],
      Subject: message.subject,
      Text: message.text,
      HTML: message.html,
    }),
  });
  expect(response.ok).toBe(true);
}

test.describe('mail fixture', () => {
  test('waits for the message to an address and reads its links', async () => {
    const to = `mail-${Date.now()}@e2e.test`;

    setTimeout(() => {
      void sendThroughMailpit({
        to,
        subject: 'Confirm your signup',
        text: 'Open https://example.test/plain to continue.',
        html: '<p><a href="https://example.test/help">Help</a> <a href="http://localhost:3000/auth/callback?code=abc&amp;next=%2Fhome">Confirm</a></p>',
      });
    }, 1500);

    const message = await waitForMessage({ to });

    expect(message.subject).toBe('Confirm your signup');
    expect(message.text).toContain('https://example.test/plain');
    expect(message.html).toContain('Confirm</a>');
    expect(firstLink(message, /\/auth\/callback/)).toBe(
      'http://localhost:3000/auth/callback?code=abc&next=%2Fhome',
    );
  });

  test('picks the message whose subject matches when an address has several', async () => {
    const to = `mail-${Date.now()}@e2e.test`;

    await sendThroughMailpit({
      to,
      subject: 'Your sign-in link',
      text: 'https://example.test/sign-in',
      html: '<a href="https://example.test/sign-in">Sign in</a>',
    });
    await sendThroughMailpit({
      to,
      subject: 'Welcome aboard',
      text: 'https://example.test/welcome',
      html: '<a href="https://example.test/welcome">Welcome</a>',
    });

    const message = await waitForMessage({ to, subject: /sign-in link/ });

    expect(message.subject).toBe('Your sign-in link');
    expect(firstLink(message, /example\.test/)).toBe(
      'https://example.test/sign-in',
    );
  });
});

test.describe('db fixture', () => {
  test('calls an RPC and waits for the row it writes', async () => {
    const key = `e2e-db-fixture-${Date.now()}`;

    expect(
      await db.rpc<boolean>('lender_rate_limit_pass', {
        key,
        window_seconds: 60,
      }),
    ).toBe(true);
    const row = await db.waitForRow<{ key: string }>(
      'lender_rate_limit',
      `key=eq.${key}&select=key`,
    );
    expect(row.key).toBe(key);

    await db.remove('lender_rate_limit', `key=eq.${key}`);
    expect(await db.rows('lender_rate_limit', `key=eq.${key}`)).toEqual([]);
  });
});

async function adminUser(email: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  expect(response.ok).toBe(true);
  const user: { id: string } = await response.json();
  return user.id;
}

async function userExists(id: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: serviceHeaders,
  });
  return response.ok;
}

async function storedObjects(bucket: string, prefix: string) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/list/${bucket}`,
    {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ prefix, limit: 100 }),
    },
  );
  const objects: { name: string }[] = await response.json();
  return objects.map((object) => object.name);
}

async function storeObject(bucket: string, path: string) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    {
      method: 'POST',
      headers: { ...serviceHeaders, 'Content-Type': 'text/plain' },
      body: 'cleanup fixture',
    },
  );
  expect(response.ok, await response.text()).toBe(true);
}

test.describe('cleanup fixture', () => {
  test('keeps what a failing test created and deletes what a passing test created', async () => {
    const testInfo = test.info();
    const { email } = newCredentials();
    const userId = await adminUser(email);
    const prefix = `e2e-cleanup-${Date.now()}`;
    await storeObject('data-room', `${prefix}/note.txt`);
    const created = [
      { kind: 'user', email },
      { kind: 'storage', bucket: 'data-room', prefix },
    ] as const;

    await settle([...created], {
      status: 'failed',
      attach: testInfo.attach.bind(testInfo),
    });
    expect(await userExists(userId)).toBe(true);
    expect(await storedObjects('data-room', prefix)).toEqual(['note.txt']);

    await settle([...created], {
      status: 'passed',
      attach: testInfo.attach.bind(testInfo),
    });
    expect(await userExists(userId)).toBe(false);
    expect(await storedObjects('data-room', prefix)).toEqual([]);
    expect(
      await db.rows('accounts', `primary_owner_user_id=eq.${userId}`),
    ).toEqual([]);
  });
});

test.describe('stand-ins', () => {
  test('the LLM stand-in answers a model with the reply a test set', async () => {
    const model = `e2e-model-${Date.now()}`;
    await standIns.llm.reply(model, '{"summary":"fixed"}');

    const response = await fetch(`${standIns.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Summarize' }],
      }),
    });
    const completion: { choices: { message: { content: string } }[] } =
      await response.json();

    expect(completion.choices[0]!.message.content).toBe('{"summary":"fixed"}');
    expect(await standIns.llm.requests(model)).toEqual([
      { model, messages: [{ role: 'user', content: 'Summarize' }] },
    ]);
  });

  test('the Nango stand-in records proxy calls and answers with the reply a test set', async () => {
    const connectionId = `e2e-connection-${Date.now()}`;
    await standIns.nango.setProxyReply({
      connectionId,
      method: 'GET',
      endpoint: '/calendar/v3/events',
      status: 200,
      body: { items: [] },
    });

    const response = await fetch(
      'http://localhost:4511/proxy/calendar/v3/events?maxResults=5',
      {
        headers: {
          'Connection-Id': connectionId,
          'Provider-Config-Key': 'google-calendar',
        },
      },
    );

    expect(await response.json()).toEqual({ items: [] });
    expect(await standIns.nango.proxyCalls(connectionId)).toEqual([
      {
        method: 'GET',
        endpoint: '/calendar/v3/events',
        connectionId,
        providerConfigKey: 'google-calendar',
        query: { maxResults: '5' },
        body: '',
      },
    ]);
  });

  test('the Stripe stand-in serves a checkout session the app created', async () => {
    const accountId = `acct-${Date.now()}`;
    const created = await fetch('http://localhost:4512/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        mode: 'subscription',
        client_reference_id: accountId,
        'line_items[0][price]': 'price_e2e_monthly',
        'line_items[0][quantity]': '1',
        return_url: 'http://localhost:3000/home',
      }),
    });
    const session: { id: string; client_secret: string } = await created.json();

    expect(session.client_secret).toContain(session.id);
    expect(
      (await standIns.stripe.checkoutSessions()).find(
        (listed) => listed.id === session.id,
      ),
    ).toMatchObject({ client_reference_id: accountId, status: 'open' });
  });
});

test.describe('auth and onboarding fixtures', () => {
  test('signs up through the confirmation email, onboards with a deal box and the comp pool, signs out and back in', async ({
    page,
    auth,
  }) => {
    test.setTimeout(240 * 1000);
    const user = await auth.signUp(page, newCredentials());

    const slug = await completeTeamOnboarding(page, `Fixture Team ${Date.now()}`, {
      dealBox: { industries: 'Accounting', states: 'TX' },
      compPoolOptIn: true,
    });

    const [team] = await db.rows<{ id: string }>(
      'accounts',
      `slug=eq.${slug}&select=id`,
    );
    const dealBox = await db.waitForRow<{ criteria_json: object }>(
      'deal_box',
      `account_id=eq.${team!.id}&select=criteria_json`,
    );
    expect(dealBox.criteria_json).toMatchObject({
      industries: ['Accounting'],
      states: ['TX'],
    });
    const optIn = await db.waitForRow<{ opted_in: boolean }>(
      'comp_pool_optin',
      `account_id=eq.${team!.id}&select=opted_in`,
    );
    expect(optIn.opted_in).toBe(true);

    await auth.signOut(page, user);
    await auth.signIn(page, user);
    await expect(page).toHaveURL(/\/home(\/|$)/);
  });
});
