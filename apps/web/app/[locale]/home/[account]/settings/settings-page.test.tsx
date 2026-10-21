// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const workspace = vi.hoisted(() => ({ isOwner: false }));

vi.mock('../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1', name: 'Acme' },
    permissions: ['settings.manage'],
    isOwner: workspace.isOwner,
  }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            throwOnError: async () => ({
              data: {
                renamed_at: null,
                legal_entity_name: null,
                team_phone: '+1 555 0100',
              },
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@odb/team-accounts', () => ({
  UpdateTeamForm: ({ teamPhone }: { teamPhone: string }) => teamPhone,
  DeleteTeamDialog: () => null,
}));
vi.mock('../../_lib/trial-actions', () => ({ reloadSampleData: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

const { default: TeamSettingsPage } = await import('./page');

async function render() {
  return renderToStaticMarkup(
    await TeamSettingsPage({
      params: Promise.resolve({ locale: 'en', account: 'acme' }),
    }),
  );
}

describe('team settings page', () => {
  it('offers the owner a way to reload sample deals', async () => {
    workspace.isOwner = true;

    expect(await render()).toContain('Reload sample deals');
  });

  it('fills the team form with the saved team phone', async () => {
    expect(await render()).toContain('+1 555 0100');
  });

  it('does not offer reloading sample deals to anyone else', async () => {
    workspace.isOwner = false;

    expect(await render()).not.toContain('Reload sample deals');
  });
});
