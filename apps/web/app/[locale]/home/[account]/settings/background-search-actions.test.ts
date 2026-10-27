import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';

const world = vi.hoisted(() => ({
  updates: [] as string[],
  canManageSettings: true,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

function resolved<Value>(value: Value) {
  return {
    then: (resolve: (settled: Value) => unknown) => resolve(value),
    throwOnError: async () => value,
  };
}

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      update: (patch: { diligence_name_spelling: string }) => ({
        eq: (column: string, value: string) => ({
          select: () => {
            if (!world.canManageSettings) {
              return resolved({ data: [], error: null });
            }
            world.updates.push(
              `update ${table} diligence_name_spelling=${patch.diligence_name_spelling} where ${column}=${value}`,
            );
            return resolved({ data: [{ id: value }], error: null });
          },
        }),
      }),
    }),
  }),
}));

const { updateNameSpellingAction } =
  await import('./background-search-actions');

beforeEach(() => {
  world.updates = [];
  world.canManageSettings = true;
});

describe('choosing how background search shows names', () => {
  it("saves the team's choice", async () => {
    const result = await updateNameSpellingAction({
      accountId: TEAM_ID,
      spelling: 'newest_record',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.updates).toEqual([
      `update accounts diligence_name_spelling=newest_record where id=${TEAM_ID}`,
    ]);
  });

  it('refuses members who cannot manage settings', async () => {
    world.canManageSettings = false;

    const result = await updateNameSpellingAction({
      accountId: TEAM_ID,
      spelling: 'newest_record',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Changing background search settings needs settings.manage',
    });
  });

  it('refuses a choice that is not offered', async () => {
    const result = await updateNameSpellingAction({
      accountId: TEAM_ID,
      spelling: 'alphabetical' as 'newest_record',
    });

    expect(result).toMatchObject({ ok: false });
    expect(world.updates).toEqual([]);
  });
});
