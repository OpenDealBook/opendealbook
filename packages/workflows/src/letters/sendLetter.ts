import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { renderTemplate } from '@odb/outreach';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { pinnedPost } from '../builder/aiClient';
import { CapReached } from '../builder/caps';
import { providerKey } from '../builder/providerKeys';
import { parsedJson } from '../builder/teamAi';
import { teamRow } from '../builder/teamRow';
import { outreachSender } from '../outreachSender';

const CHECK_VIOLATION = '23514';
const LOB_TIMEOUT_MS = 30_000;

export class LetterCapReached extends CapReached {
  constructor() {
    super('The monthly letter limit is reached');
  }
}

export class LetterSetupMissing extends ApplicationFailure {
  constructor(message: string) {
    super(message, 'LetterSetupMissing', true);
  }
}

const lobVerification = z.object({
  deliverability: z.string(),
  primary_line: z.string(),
  components: z.object({ city: z.string(), state: z.string(), zip_code: z.string() }),
});

const lobLetter = z.object({ id: z.string() });

const lobRefusal = z.object({ error: z.object({ message: z.string() }) });

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function letterHtml(text: string): string {
  return `<html><body>${escapeHtml(text).replace(/\n/g, '<br>')}</body></html>`;
}

async function lob(
  key: { apiKey: string; baseUrl: string },
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<{ status: number; body: unknown }> {
  const response = await pinnedPost(
    `${key.baseUrl}${path}`,
    {
      authorization: `Basic ${Buffer.from(`${key.apiKey}:`).toString('base64')}`,
      ...(idempotencyKey && { 'idempotency-key': idempotencyKey }),
    },
    body,
    { timeoutMs: LOB_TIMEOUT_MS },
  );
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`Lob answered ${response.status}`);
  }
  const parsed = parsedJson(response.text);
  if (response.status < 300 && parsed === undefined) {
    throw ApplicationFailure.nonRetryable('Lob answered with something that is not JSON');
  }
  return { status: response.status, body: parsed };
}

export async function sendLetter(letter: {
  accountId: string;
  firmId: string;
  body: string;
  idempotencyKey: string;
  enrollmentId?: string;
  stepOrdinal?: number;
}): Promise<{ letterId: string; status: string }> {
  const admin = getSupabaseServerAdminClient();

  const { data: recorded } = await admin
    .from('outreach_letter')
    .select('id, status, error')
    .eq('account_id', letter.accountId)
    .eq('idempotency_key', letter.idempotencyKey)
    .maybeSingle()
    .throwOnError();
  if (recorded?.status === 'failed') {
    throw ApplicationFailure.nonRetryable(`Lob refused the letter: ${recorded.error}`);
  }
  if (recorded !== null && recorded.status !== 'queued') {
    return { letterId: recorded.id, status: recorded.status };
  }

  const key = await providerKey(letter.accountId, 'letters');
  if (key === null) {
    throw new LetterSetupMissing('Connect a letter provider first');
  }

  const { data: setting } = await admin
    .from('outreach_setting')
    .select(
      'letter_return_name, letter_return_address_line1, letter_return_city, letter_return_state, letter_return_postal_code',
    )
    .eq('account_id', letter.accountId)
    .maybeSingle()
    .throwOnError();
  if (
    !setting?.letter_return_name ||
    !setting.letter_return_address_line1 ||
    !setting.letter_return_city ||
    !setting.letter_return_state ||
    !setting.letter_return_postal_code
  ) {
    throw new LetterSetupMissing('Set a letter return address first');
  }

  const firm = await teamRow(letter.firmId, 'That firm is not on this team', (id) =>
    getSupabaseServerAdminClient()
      .from('firm')
      .select('name, industry, city, state, website, owner_mailing_address_line1, owner_mailing_city, owner_mailing_state, owner_mailing_postal_code')
      .eq('id', id)
      .eq('account_id', letter.accountId)
      .maybeSingle()
      .throwOnError(),
  );
  if (
    !firm.owner_mailing_address_line1 ||
    !firm.owner_mailing_city ||
    !firm.owner_mailing_state ||
    !firm.owner_mailing_postal_code
  ) {
    throw ApplicationFailure.nonRetryable('This firm has no mailing address');
  }

  const checked = await lob(key, '/us_verifications', {
    primary_line: firm.owner_mailing_address_line1,
    city: firm.owner_mailing_city,
    state: firm.owner_mailing_state,
    zip_code: firm.owner_mailing_postal_code,
  });
  if (checked.status === 401 || checked.status === 403) {
    throw new LetterSetupMissing('Check your Lob key');
  }
  if (checked.status === 422) {
    throw ApplicationFailure.nonRetryable("The mailing address can't be delivered");
  }
  if (checked.status >= 300) {
    throw ApplicationFailure.nonRetryable(`Lob answered ${checked.status}`);
  }
  const verification = lobVerification.parse(checked.body);
  if (verification.deliverability === 'undeliverable') {
    throw ApplicationFailure.nonRetryable("The mailing address can't be delivered");
  }
  const address = {
    address_line1: verification.primary_line,
    city: verification.components.city,
    state: verification.components.state,
    postal_code: verification.components.zip_code,
  };

  let letterId = recorded?.id;
  if (letterId === undefined) {
    const { data: inserted, error } = await admin
      .from('outreach_letter')
      .insert({
        account_id: letter.accountId,
        enrollment_id: letter.enrollmentId,
        step_ordinal: letter.stepOrdinal,
        idempotency_key: letter.idempotencyKey,
        provider: 'lob',
        ...address,
      })
      .select('id')
      .single();
    if (error?.code === CHECK_VIOLATION && error.message === 'monthly letter cap reached') {
      throw new LetterCapReached();
    }
    if (error) {
      throw error;
    }
    letterId = inserted.id;
  }

  const text = renderTemplate(letter.body, {
    firm: {
      name: firm.name,
      industry: firm.industry ?? undefined,
      city: firm.city ?? undefined,
      state: firm.state ?? undefined,
      website: firm.website ?? undefined,
    },
    sender: await outreachSender(letter.accountId),
  });

  const created = await lob(
    key,
    '/letters',
    {
      to: {
        name: firm.name,
        address_line1: address.address_line1,
        address_city: address.city,
        address_state: address.state,
        address_zip: address.postal_code,
      },
      from: {
        name: setting.letter_return_name,
        address_line1: setting.letter_return_address_line1,
        address_city: setting.letter_return_city,
        address_state: setting.letter_return_state,
        address_zip: setting.letter_return_postal_code,
      },
      file: letterHtml(text),
      color: false,
      use_type: 'marketing',
    },
    letter.idempotencyKey,
  );

  if (created.status >= 300) {
    const refusal = lobRefusal.safeParse(created.body);
    const reason = refusal.success ? refusal.data.error.message : `Lob answered ${created.status}`;
    await admin
      .from('outreach_letter')
      .update({ status: 'failed', error: reason })
      .eq('id', letterId)
      .throwOnError();
    throw ApplicationFailure.nonRetryable(`Lob refused the letter: ${reason}`);
  }

  await admin
    .from('outreach_letter')
    .update({ status: 'created', provider_letter_id: lobLetter.parse(created.body).id })
    .eq('id', letterId)
    .throwOnError();
  return { letterId, status: 'created' };
}
