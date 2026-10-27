import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { deliverable, fakeLob, letterCreated, undeliverable } from '../../../test-support/fake-lob';
import { provisionAccount, type IntegrationAccount } from '../../../test-support/integration-harness';
import { CapReached } from '../caps';
import { LetterSetupMissing, sendLetter as sequenceLetter } from '../../letters/sendLetter';
import { sendLetter } from './sendLetter';

const network = vi.hoisted(() => ({ trustedFakeUrl: '' }));

vi.mock('../publicUrl', async (importOriginal) => {
  const { publicAddressOf } = await importOriginal<typeof import('../publicUrl')>();
  return {
    publicAddressOf: async (url: string) =>
      url.startsWith(network.trustedFakeUrl) ? { address: '127.0.0.1', family: 4 } : publicAddressOf(url),
  };
});

let owner: IntegrationAccount;
let lob: Awaited<ReturnType<typeof fakeLob>>;
let templateId: string;
const others: IntegrationAccount[] = [];

const RETURN_ADDRESS = {
  letter_return_name: 'Harbor Acquisitions',
  letter_return_address_line1: '9 Elm St',
  letter_return_city: 'Austin',
  letter_return_state: 'TX',
  letter_return_postal_code: '78702',
};

async function firm(name: string, address = true): Promise<string> {
  const { data } = await owner.admin
    .from('firm')
    .insert({
      account_id: owner.accountId,
      name,
      ...(address && {
        owner_mailing_address_line1: '100 main street suite 2',
        owner_mailing_city: 'Austin',
        owner_mailing_state: 'TX',
        owner_mailing_postal_code: '78701',
      }),
    })
    .select('id')
    .single()
    .throwOnError();
  return data.id;
}

async function settings(values: Record<string, unknown>): Promise<void> {
  await owner.admin
    .from('outreach_setting')
    .upsert({ account_id: owner.accountId, daily_cap: 10, ...values }, { onConflict: 'account_id' })
    .throwOnError();
}

const runKey = crypto.randomUUID();

function send(firmId: string, idempotencyKey: string) {
  return sendLetter.execute({
    context: { accountId: owner.accountId, runId: crypto.randomUUID(), idempotencyKey: `${runKey}:${idempotencyKey}` },
    config: { firmId, templateId },
    input: {},
  });
}

async function lettersOf(key: string) {
  const { data } = await owner.admin
    .from('outreach_letter')
    .select('id, provider, provider_letter_id, address_line1, city, state, postal_code, status, error, cost_cents, enrollment_id')
    .eq('idempotency_key', `${runKey}:${key}`)
    .throwOnError();
  return data;
}

beforeAll(async () => {
  owner = await provisionAccount();
  lob = await fakeLob();
  network.trustedFakeUrl = lob.baseUrl;
  const { data: template } = await owner.admin
    .from('letter_template')
    .insert({ account_id: owner.accountId, name: 'Intro', body: 'Dear owner of {{ firm.name }},\nWe would like to talk.' })
    .select('id')
    .single()
    .throwOnError();
  templateId = template.id;
});

beforeEach(async () => {
  lob.received.length = 0;
  lob.replies.letter = letterCreated(`ltr_${crypto.randomUUID()}`);
  lob.replies.verification = deliverable();
  await settings({ letter_monthly_cap: 100, ...RETURN_ADDRESS });
  await owner.user
    .rpc('save_provider_credential', { p_account_id: owner.accountId, p_kind: 'letters', p_api_key: 'lob-team-key' })
    .throwOnError();
  await owner.admin
    .from('provider_credential')
    .update({ base_url: lob.baseUrl })
    .eq('account_id', owner.accountId)
    .eq('kind', 'letters')
    .throwOnError();
});

afterAll(async () => {
  for (const other of others) {
    await other.admin.from('accounts').delete().eq('id', other.accountId);
    await other.cleanup();
  }
  lob.close();
  await owner.admin.from('accounts').delete().eq('id', owner.accountId);
  await owner.cleanup();
});

describe('send_letter', () => {
  it("checks the address, then mails the team's template through Lob on the team's key", async () => {
    const firmId = await firm('Riverside Plumbing');
    lob.replies.letter = letterCreated('ltr_riverside');

    const output = await send(firmId, 'run-a:letter:0');

    const [verification, letter] = lob.received;
    expect(verification!.path).toBe('/v1/us_verifications');
    expect(verification!.body).toEqual({
      primary_line: '100 main street suite 2',
      city: 'Austin',
      state: 'TX',
      zip_code: '78701',
    });
    expect(letter!.path).toBe('/v1/letters');
    expect(letter!.headers.authorization).toBe(`Basic ${Buffer.from('lob-team-key:').toString('base64')}`);
    expect(letter!.headers['idempotency-key']).toBe(`${runKey}:run-a:letter:0`);
    expect(letter!.body).toMatchObject({
      to: {
        name: 'Riverside Plumbing',
        address_line1: '100 MAIN ST STE 2',
        address_city: 'AUSTIN',
        address_state: 'TX',
        address_zip: '78701',
      },
      from: {
        name: 'Harbor Acquisitions',
        address_line1: '9 Elm St',
        address_city: 'Austin',
        address_state: 'TX',
        address_zip: '78702',
      },
      color: false,
      use_type: 'marketing',
    });
    expect(letter!.body.file).toContain('Dear owner of Riverside Plumbing,<br>We would like to talk.');

    const [row] = await lettersOf('run-a:letter:0');
    expect(output).toEqual({ letterId: row!.id, status: 'created' });
    expect(row).toMatchObject({
      provider: 'lob',
      provider_letter_id: 'ltr_riverside',
      address_line1: '100 MAIN ST STE 2',
      city: 'AUSTIN',
      state: 'TX',
      postal_code: '78701',
      status: 'created',
      error: null,
      cost_cents: null,
      enrollment_id: null,
    });
  });

  it('mails once when the step runs again with the same key', async () => {
    const firmId = await firm('Twice Roofing');

    const first = await send(firmId, 'run-b:letter:0');
    const second = await send(firmId, 'run-b:letter:0');

    expect(second).toEqual(first);
    expect(lob.lettersCreated()).toHaveLength(1);
    expect(await lettersOf('run-b:letter:0')).toHaveLength(1);
  });

  it('fails at once without a letter provider', async () => {
    const firmId = await firm('Keyless Electric');
    await owner.user
      .rpc('disconnect_provider_credential', { p_account_id: owner.accountId, p_kind: 'letters' })
      .throwOnError();

    const refused = send(firmId, 'run-c:letter:0');
    await expect(refused).rejects.toBeInstanceOf(LetterSetupMissing);
    await expect(refused).rejects.toMatchObject({
      message: 'Connect a letter provider first',
      nonRetryable: true,
    });
    expect(lob.received).toEqual([]);
  });

  it('fails at once without a return address', async () => {
    const firmId = await firm('Returnless Hvac');
    await settings({ letter_return_address_line1: null });

    const refused = send(firmId, 'run-d:letter:0');
    await expect(refused).rejects.toBeInstanceOf(LetterSetupMissing);
    await expect(refused).rejects.toMatchObject({
      message: 'Set a letter return address first',
      nonRetryable: true,
    });
    expect(lob.received).toEqual([]);
  });

  it('fails at once when the firm has no mailing address', async () => {
    const firmId = await firm('Addressless Masonry', false);

    await expect(send(firmId, 'run-e:letter:0')).rejects.toMatchObject({
      message: 'This firm has no mailing address',
      nonRetryable: true,
    });
    expect(lob.received).toEqual([]);
  });

  it('fails an undeliverable address without spending the letter cap', async () => {
    const firmId = await firm('Lost Landscaping');
    lob.replies.verification = undeliverable();

    await expect(send(firmId, 'run-f:letter:0')).rejects.toMatchObject({
      message: "The mailing address can't be delivered",
      nonRetryable: true,
    });
    expect(lob.lettersCreated()).toEqual([]);
    expect(await lettersOf('run-f:letter:0')).toEqual([]);
  });

  it('pauses at the monthly letter cap without mailing', async () => {
    const firmId = await firm('Capped Painting');
    await settings({ letter_monthly_cap: 0 });

    await expect(send(firmId, 'run-g:letter:0')).rejects.toBeInstanceOf(CapReached);
    expect(lob.lettersCreated()).toEqual([]);
  });

  it('records a letter Lob refuses as failed', async () => {
    const firmId = await firm('Refused Paving');
    lob.replies.letter = { status: 422, body: { error: { message: 'file is too long', status_code: 422 } } };

    await expect(send(firmId, 'run-h:letter:0')).rejects.toMatchObject({
      message: 'Lob refused the letter: file is too long',
      nonRetryable: true,
    });
    expect(await lettersOf('run-h:letter:0')).toMatchObject([{ status: 'failed', error: 'file is too long' }]);
  });
});

describe('a letter template that is not on this team', () => {
  it.each([
    ['another team', async () => {
      const other = await provisionAccount();
      others.push(other);
      const { data } = await other.admin
        .from('letter_template')
        .insert({ account_id: other.accountId, name: 'Theirs', body: 'Hello' })
        .select('id')
        .single()
        .throwOnError();
      return data.id as string;
    }],
    ['nowhere', async () => crypto.randomUUID()],
    ['not an id', async () => 'intro'],
  ])('refuses a template from %s without mailing', async (_where, template) => {
    const firmId = await firm(`Templateless ${crypto.randomUUID().slice(0, 6)}`);

    await expect(
      sendLetter.execute({
        context: { accountId: owner.accountId, runId: crypto.randomUUID(), idempotencyKey: `${runKey}:${crypto.randomUUID()}` },
        config: { firmId, templateId: await template() },
        input: {},
      }),
    ).rejects.toMatchObject({ message: 'That letter template is not on this team', nonRetryable: true });
    expect(lob.received).toEqual([]);
  });
});

describe('the letter sender', () => {
  function signLetter(firmId: string) {
    return sequenceLetter({
      accountId: owner.accountId,
      firmId,
      body: 'Signed, {{ sender.name }} of {{ sender.company }}',
      idempotencyKey: `${runKey}:${crypto.randomUUID()}`,
    });
  }

  it("signs with the team owner's name when the buyer profile has no contact name", async () => {
    const { data: personal } = await owner.admin
      .from('accounts')
      .select('name')
      .eq('primary_owner_user_id', owner.userId)
      .eq('is_personal_account', true)
      .single()
      .throwOnError();
    const { data: team } = await owner.admin.from('accounts').select('name').eq('id', owner.accountId).single().throwOnError();

    await signLetter(await firm('Unsigned Masonry'));

    expect(lob.lettersCreated()[0]!.body.file).toContain(`Signed, ${personal.name} of ${team.name}`);
  });

  it("signs with the buyer profile's contact name", async () => {
    await owner.admin
      .from('buyer_profile')
      .insert({ account_id: owner.accountId, version: 1, display_name: 'Avery Buyer' })
      .throwOnError();
    const { data: team } = await owner.admin.from('accounts').select('name').eq('id', owner.accountId).single().throwOnError();

    await signLetter(await firm('Signed Masonry'));

    expect(lob.lettersCreated()[0]!.body.file).toContain(`Signed, Avery Buyer of ${team.name}`);
  });
});

describe('when Lob is unavailable', () => {
  it.each([
    ['busy', { status: 429, body: { error: { message: 'rate limited', status_code: 429 } } }],
    ['down', { status: 503, body: { error: { message: 'unavailable', status_code: 503 } } }],
    ['behind a broken gateway', { status: 502, body: '<html>Bad Gateway</html>' }],
  ])('retries later while Lob is %s, keeping the letter queued', async (_state, reply) => {
    const firmId = await firm(`Waiting ${crypto.randomUUID().slice(0, 6)}`);
    lob.replies.letter = reply;
    const key = `run-n:${crypto.randomUUID()}`;

    const refused = await send(firmId, key).catch((error: { nonRetryable?: boolean; message: string }) => error);

    expect(refused).toMatchObject({ message: `Lob answered ${reply.status}` });
    expect((refused as { nonRetryable?: boolean }).nonRetryable).not.toBe(true);
    expect(await lettersOf(key)).toMatchObject([{ status: 'queued', error: null }]);
  });

  it('fails a refusal that names no reason by its status', async () => {
    const firmId = await firm('Reasonless Siding');
    lob.replies.letter = { status: 422, body: {} };

    await expect(send(firmId, 'run-o:letter:0')).rejects.toMatchObject({
      message: 'Lob refused the letter: Lob answered 422',
      nonRetryable: true,
    });
    expect(await lettersOf('run-o:letter:0')).toMatchObject([{ status: 'failed', error: 'Lob answered 422' }]);
  });

  it('fails at once when Lob answers success with something that is not JSON', async () => {
    const firmId = await firm('Garbled Gutters');
    lob.replies.letter = { status: 200, body: 'ok' };

    await expect(send(firmId, 'run-p:letter:0')).rejects.toMatchObject({
      message: 'Lob answered with something that is not JSON',
      nonRetryable: true,
    });
  });

  it('retries an address check while Lob is down', async () => {
    const firmId = await firm('Unchecked Stucco');
    lob.replies.verification = { status: 502, body: '<html>Bad Gateway</html>' };

    const refused = await send(firmId, 'run-q:letter:0').catch((error: { nonRetryable?: boolean }) => error);

    expect((refused as { nonRetryable?: boolean }).nonRetryable).not.toBe(true);
    expect(lob.lettersCreated()).toEqual([]);
  });
});

describe('the Lob address check', () => {
  it.each([401, 403])('asks the team to check its Lob key when Lob answers %s', async (status) => {
    const firmId = await firm(`Unkeyed ${crypto.randomUUID().slice(0, 6)}`);
    lob.replies.verification = { status, body: { error: { message: 'unauthorized', status_code: status } } };

    const refused = send(firmId, `run-s:${crypto.randomUUID()}`);

    await expect(refused).rejects.toBeInstanceOf(LetterSetupMissing);
    await expect(refused).rejects.toMatchObject({ message: 'Check your Lob key', nonRetryable: true });
    expect(lob.lettersCreated()).toEqual([]);
  });

  it('fails an address Lob cannot read as undeliverable', async () => {
    const firmId = await firm('Unreadable Roofing');
    lob.replies.verification = { status: 422, body: { error: { message: 'primary_line is required', status_code: 422 } } };

    await expect(send(firmId, 'run-t:letter:0')).rejects.toMatchObject({
      message: "The mailing address can't be delivered",
      nonRetryable: true,
    });
    expect(lob.lettersCreated()).toEqual([]);
  });

  it('retries the check while Lob is busy', async () => {
    const firmId = await firm('Busy Brickwork');
    lob.replies.verification = { status: 429, body: { error: { message: 'rate limited', status_code: 429 } } };

    const refused = await send(firmId, 'run-u:letter:0').catch((error: { nonRetryable?: boolean; message: string }) => error);

    expect(refused).toMatchObject({ message: 'Lob answered 429' });
    expect((refused as { nonRetryable?: boolean }).nonRetryable).not.toBe(true);
  });
});

describe('a firm that is not on this team', () => {
  it('refuses it without mailing', async () => {
    await expect(send(crypto.randomUUID(), 'run-r:letter:0')).rejects.toMatchObject({
      message: 'That firm is not on this team',
      nonRetryable: true,
    });
    expect(lob.received).toEqual([]);
  });
});

describe('retrying a refused letter', () => {
  it('fails again with the stored reason and mails nothing', async () => {
    const firmId = await firm('Retried Paving');
    lob.replies.letter = { status: 422, body: { error: { message: 'file is too long', status_code: 422 } } };
    await expect(send(firmId, 'run-i:letter:0')).rejects.toThrow();
    lob.received.length = 0;
    lob.replies.letter = letterCreated(`ltr_${crypto.randomUUID()}`);

    await expect(send(firmId, 'run-i:letter:0')).rejects.toMatchObject({
      message: 'Lob refused the letter: file is too long',
      nonRetryable: true,
    });
    expect(lob.received).toEqual([]);
    expect(await lettersOf('run-i:letter:0')).toMatchObject([{ status: 'failed' }]);
  });
});

describe('sendLetter for a sequence letter step', () => {
  it('records the enrollment and step it mailed for', async () => {
    const firmId = await firm('Sequenced Glass');
    const { data: sequence } = await owner.admin
      .from('outreach_sequence')
      .insert({ account_id: owner.accountId, name: 'Letter first' })
      .select('id')
      .single()
      .throwOnError();
    const { data: enrollment } = await owner.admin
      .from('outreach_enrollment')
      .insert({
        account_id: owner.accountId,
        sequence_id: sequence.id,
        firm_id: firmId,
        target_email: 'owner@sequenced.test',
        status: 'held',
      })
      .select('id')
      .single()
      .throwOnError();

    const { letterId } = await sequenceLetter({
      accountId: owner.accountId,
      firmId,
      body: 'Hello {{ firm.name }}',
      idempotencyKey: `${runKey}:enrollment:1`,
      enrollmentId: enrollment.id,
      stepOrdinal: 1,
    });

    const { data: row } = await owner.admin
      .from('outreach_letter')
      .select('id, enrollment_id, step_ordinal')
      .eq('id', letterId)
      .single()
      .throwOnError();
    expect(row).toEqual({ id: letterId, enrollment_id: enrollment.id, step_ordinal: 1 });
  });
});
