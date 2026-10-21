import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

import {
  loadRelayCursor,
  recordRelayFailedEvent,
  saveRelayCursor,
  startRelayCursorAtLatest,
} from './activities';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const name = `int-relay-${crypto.randomUUID()}`;

afterAll(async () => {
  await admin.from('relay_cursor').delete().eq('name', name);
});

describe('starting a relay cursor at the latest event', () => {
  const fresh = `int-relay-${crypto.randomUUID()}`;
  const started = `int-relay-${crypto.randomUUID()}`;

  afterAll(async () => {
    await admin.from('relay_cursor').delete().in('name', [fresh, started]);
  });

  it('saves and returns the highest global_seq in deal_event', async () => {
    const { data: latest } = await admin
      .from('deal_event')
      .select('global_seq')
      .order('global_seq', { ascending: false })
      .limit(1)
      .single();

    expect(await startRelayCursorAtLatest(fresh)).toBe(latest!.global_seq);
    expect(await loadRelayCursor(fresh)).toBe(latest!.global_seq);
  });

  it('keeps a position another start already saved', async () => {
    await saveRelayCursor({ name: started, lastGlobalSeq: 5 });

    expect(await startRelayCursorAtLatest(started)).toBe(5);
    expect(await loadRelayCursor(started)).toBe(5);
  });
});

describe('relay cursor', () => {
  it('has no position for a relay that never saved one', async () => {
    expect(await loadRelayCursor(name)).toBeNull();
  });

  it('returns the last saved position, overwriting earlier saves', async () => {
    await saveRelayCursor({ name, lastGlobalSeq: 41 });
    await saveRelayCursor({ name, lastGlobalSeq: 97 });
    await saveRelayCursor({ name, lastGlobalSeq: 97 });

    expect(await loadRelayCursor(name)).toBe(97);
  });
});

describe('setting aside a failed relay event', () => {
  const relayName = `int-relay-${crypto.randomUUID()}`;

  afterAll(async () => {
    await admin
      .from('relay_failed_event')
      .update({ resolved_at: new Date().toISOString() })
      .eq('relay_name', relayName);
  });

  it('records the event once with its last error, however often the record is repeated', async () => {
    const failure = { relayName, globalSeq: 23494, error: 'Cannot coerce the result', attempts: 5 };

    await recordRelayFailedEvent(failure);
    await recordRelayFailedEvent(failure);

    const { data } = await admin
      .from('relay_failed_event')
      .select('relay_name, global_seq, error, attempts, retried_at, resolved_at')
      .eq('relay_name', relayName)
      .throwOnError();
    expect(data).toEqual([
      {
        relay_name: relayName,
        global_seq: 23494,
        error: 'Cannot coerce the result',
        attempts: 5,
        retried_at: null,
        resolved_at: null,
      },
    ]);
  });
});

describe('telling super admins about a set-aside relay event', () => {
  const relayName = `int-relay-${crypto.randomUUID()}`;
  let superAdmin: IntegrationAccount;
  let member: IntegrationAccount;

  beforeAll(async () => {
    superAdmin = await provisionAccount();
    member = await provisionAccount();
    await admin.auth.admin.updateUserById(superAdmin.userId, {
      app_metadata: { role: 'super-admin' },
    });
  });

  afterAll(async () => {
    await admin
      .from('relay_failed_event')
      .update({ resolved_at: new Date().toISOString() })
      .eq('relay_name', relayName);
    await admin.from('notifications').delete().like('dedupe_key', `relay_failed:${relayName}:%`);
    await superAdmin.cleanup();
    await member.cleanup();
  });

  it('notifies each super admin in the app once, and logs the relay and event', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = { relayName, globalSeq: 23494, error: 'Cannot coerce the result', attempts: 5 };

    await recordRelayFailedEvent(failure);
    await recordRelayFailedEvent(failure);

    const { data: notices } = await admin
      .from('notifications')
      .select('account_id, recipient_user_id, link, dedupe_key')
      .like('dedupe_key', `relay_failed:${relayName}:%`)
      .in('recipient_user_id', [superAdmin.userId, member.userId])
      .throwOnError();
    expect(notices).toEqual([
      {
        account_id: superAdmin.userId,
        recipient_user_id: superAdmin.userId,
        link: '/admin',
        dedupe_key: `relay_failed:${relayName}:23494:${superAdmin.userId}`,
      },
    ]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(`${relayName} event 23494`));
    logged.mockRestore();
  });
});
