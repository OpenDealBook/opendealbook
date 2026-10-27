import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';

const world = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  error: null as { code: string; message: string } | null,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (world.error) {
        return { data: null, error: world.error };
      }
      world.calls.push({ name, ...args });
      return { data: null, error: null };
    },
  }),
}));

const { saveProviderKeyAction, disconnectProviderKeyAction } = await import('./provider-key-actions');

beforeEach(() => {
  world.calls = [];
  world.error = null;
});

describe('saving a provider key', () => {
  it('saves the email lookup key and actor', async () => {
    const result = await saveProviderKeyAction({
      accountId: TEAM_ID,
      kind: 'email_lookup',
      apiKey: 'apify-new',
      actorId: 'acme~site-contacts',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.calls).toEqual([
      {
        name: 'save_provider_credential',
        p_account_id: TEAM_ID,
        p_kind: 'email_lookup',
        p_api_key: 'apify-new',
        p_actor_id: 'acme~site-contacts',
      },
    ]);
  });

  it('keeps the stored key and actor when those fields are left empty', async () => {
    await saveProviderKeyAction({ accountId: TEAM_ID, kind: 'letters', apiKey: '', actorId: '' });

    expect(world.calls).toEqual([
      {
        name: 'save_provider_credential',
        p_account_id: TEAM_ID,
        p_kind: 'letters',
        p_api_key: undefined,
        p_actor_id: undefined,
      },
    ]);
  });

  it.each([
    [{ code: '42501', message: 'changing provider keys needs settings.manage' }, 'Changing provider keys needs settings.manage'],
    [{ code: '23514', message: 'paste an API key' }, 'Paste an API key'],
    [
      { code: '22P02', message: 'use an Apify actor id' },
      'Use an Apify actor id such as username/actor-name',
    ],
  ])('turns a database refusal into a message', async (error, refusal) => {
    world.error = error;

    expect(
      await saveProviderKeyAction({ accountId: TEAM_ID, kind: 'email_lookup', apiKey: 'k', actorId: 'bad id' }),
    ).toEqual({ ok: false, refusal });
  });
});

describe('saving the Lob webhook secret', () => {
  it('saves the webhook secret with the letters key', async () => {
    await saveProviderKeyAction({
      accountId: TEAM_ID,
      kind: 'letters',
      apiKey: '',
      actorId: '',
      webhookSecret: 'hook-secret',
    });

    expect(world.calls).toEqual([
      {
        name: 'save_provider_credential',
        p_account_id: TEAM_ID,
        p_kind: 'letters',
        p_api_key: undefined,
        p_actor_id: undefined,
        p_webhook_secret: 'hook-secret',
      },
    ]);
  });
});

describe('an unexpected database error', () => {
  it('is rethrown, not shown as a refusal', async () => {
    world.error = { code: '57014', message: 'canceling statement due to statement timeout' };

    await expect(
      saveProviderKeyAction({ accountId: TEAM_ID, kind: 'letters', apiKey: 'k', actorId: '' }),
    ).rejects.toMatchObject({ code: '57014' });
    await expect(disconnectProviderKeyAction({ accountId: TEAM_ID, kind: 'letters' })).rejects.toMatchObject({
      code: '57014',
    });
  });
});

describe('disconnecting a provider key', () => {
  it('refuses members who cannot manage settings', async () => {
    world.error = { code: '42501', message: 'changing provider keys needs settings.manage' };

    expect(await disconnectProviderKeyAction({ accountId: TEAM_ID, kind: 'email_lookup' })).toEqual({
      ok: false,
      refusal: 'Changing provider keys needs settings.manage',
    });
  });


  it("disconnects the team's key for that kind", async () => {
    expect(await disconnectProviderKeyAction({ accountId: TEAM_ID, kind: 'letters' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(world.calls).toEqual([
      { name: 'disconnect_provider_credential', p_account_id: TEAM_ID, p_kind: 'letters' },
    ]);
  });
});
