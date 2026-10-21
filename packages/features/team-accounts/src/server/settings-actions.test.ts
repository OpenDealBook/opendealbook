import { describe, expect, it, vi } from 'vitest';

const updates: unknown[] = [];

let updated: { data: unknown; error: unknown } = {
  data: { slug: 'initech-partners' },
  error: null,
};

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: async () => ({ data: true, error: null }),
    from: () => ({
      update: (row: unknown) => {
        updates.push(row);

        return {
          eq: () => ({
            select: () => ({
              single: async () => updated,
            }),
          }),
        };
      },
    }),
  }),
}));

import { updateTeamAction } from './settings-actions';

type Handler = (
  data: {
    accountId: string;
    name: string;
    legalEntityName?: string;
    teamPhone?: string;
  },
  user: { id: string },
) => Promise<unknown>;

describe('updateTeamAction', () => {
  it('saves the legal entity name beside the team name', async () => {
    await (updateTeamAction as unknown as Handler)(
      {
        accountId: '00000000-0000-0000-0000-000000000001',
        name: 'Initech Partners',
        legalEntityName: 'Initech Acquisitions LLC',
      },
      { id: 'user-1' },
    );

    expect(updates.at(-1)).toEqual({
      name: 'Initech Partners',
      legal_entity_name: 'Initech Acquisitions LLC',
    });
  });

  it('saves the team phone', async () => {
    await (updateTeamAction as unknown as Handler)(
      {
        accountId: '00000000-0000-0000-0000-000000000001',
        name: 'Initech Partners',
        teamPhone: '+1 555 0200',
      },
      { id: 'user-1' },
    );

    expect(updates.at(-1)).toMatchObject({ team_phone: '+1 555 0200' });
  });

  it('saves an emptied team phone as no phone', async () => {
    await (updateTeamAction as unknown as Handler)(
      {
        accountId: '00000000-0000-0000-0000-000000000001',
        name: 'Initech Partners',
        teamPhone: '',
      },
      { id: 'user-1' },
    );

    expect(updates.at(-1)).toMatchObject({ team_phone: null });
  });

  it('returns the slug the database derived from the new name', async () => {
    const result = await (updateTeamAction as unknown as Handler)(
      {
        accountId: '00000000-0000-0000-0000-000000000001',
        name: 'Initech Partners',
      },
      { id: 'user-1' },
    );

    expect(result).toEqual({ success: true, slug: 'initech-partners' });
  });

  it('returns the date a refused rename is allowed again', async () => {
    updated = {
      data: null,
      error: {
        code: 'ODB01',
        message: 'team was renamed recently',
        details: '2026-11-13T12:00:00+00:00',
      },
    };

    const result = await (updateTeamAction as unknown as Handler)(
      {
        accountId: '00000000-0000-0000-0000-000000000001',
        name: 'Globex',
      },
      { id: 'user-1' },
    );

    expect(result).toEqual({
      success: false,
      renameAllowedAt: '2026-11-13T12:00:00+00:00',
    });
  });
});
