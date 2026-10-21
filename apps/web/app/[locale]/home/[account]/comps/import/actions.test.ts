import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  locked: false,
  importComps: vi.fn(async () => ({ imported: 3 })),
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: unknown) => unknown) => (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/comps', () => ({ importComps: world.importComps }));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({}),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: async (name: string) => ({
      data: name === 'is_account_locked' ? world.locked : true,
      error: null,
    }),
  }),
}));

import { importCompsAction } from './actions';

const input = {
  accountId: 'team-1',
  vendor: 'dealstats' as const,
  filename: 'comps.csv',
  format: 'csv' as const,
  content: 'a,b',
};

describe('importCompsAction', () => {
  beforeEach(() => {
    world.locked = false;
    world.importComps.mockClear();
  });

  it('refuses a locked team before importing anything', async () => {
    world.locked = true;

    await expect(importCompsAction(input)).rejects.toThrow(
      'This team is read-only until billing is updated.',
    );
    expect(world.importComps).not.toHaveBeenCalled();
  });

  it('imports for an unlocked team', async () => {
    await expect(importCompsAction(input)).resolves.toEqual({ imported: 3 });
  });
});
