import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubBootEnv } from '../../../../test-env';

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: async () => ({ data: false }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { trial_ends_at: '2026-01-01T00:00:00.000Z' },
          }),
        }),
      }),
    }),
  }),
}));

async function loadTrialStateWithBilling(value: 'false' | undefined) {
  stubBootEnv({ ENABLE_BILLING: value });
  const { loadTrialState } = await import('./trial');

  return loadTrialState('acc-1');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadTrialState', () => {
  it('reports an ended trial when billing is on', async () => {
    expect(await loadTrialStateWithBilling(undefined)).toEqual({
      isActive: false,
      endsAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('reports a trial that never ends when billing is off', async () => {
    expect(await loadTrialStateWithBilling('false')).toEqual({
      isActive: true,
      endsAt: null,
    });
  });
});
