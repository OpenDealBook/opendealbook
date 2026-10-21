// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const workspace = vi.hoisted(() => ({
  isOwner: false,
  permissions: ['settings.manage'],
  timezone: 'America/Chicago',
  aiEndpoint: null as { provider: string; chat_model: string; base_url: string } | null,
}));

vi.mock('../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1', name: 'Acme' },
    permissions: workspace.permissions,
    isOwner: workspace.isOwner,
  }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => ({
            throwOnError: async () => ({ data: workspace.aiEndpoint }),
          }),
          single: () => ({
            throwOnError: async () => ({
              data: {
                renamed_at: null,
                legal_entity_name: null,
                team_phone: '+1 555 0100',
                timezone: workspace.timezone,
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

  it("shows the team's saved time zone", async () => {
    workspace.timezone = 'America/Chicago';

    expect(await render()).toContain(
      '<option value="America/Chicago" selected="">',
    );
  });

  it('shows a UTC team as UTC', async () => {
    workspace.timezone = 'UTC';

    expect(await render()).toContain('<option value="UTC" selected="">');
  });

  it('shows a saved zone missing from the offered list as itself', async () => {
    workspace.timezone = 'Etc/GMT+5';

    expect(await render()).toContain('<option value="Etc/GMT+5" selected="">');
  });

  it('lets settings managers change the time zone', async () => {
    workspace.permissions = ['settings.manage'];

    expect(await render()).not.toMatch(/<select[^>]*disabled/);
  });

  it('shows the time zone read-only to members who cannot manage settings', async () => {
    workspace.permissions = [];

    expect(await render()).toMatch(/<select[^>]*disabled/);
  });

  it("shows members who cannot manage settings the team's AI provider and model", async () => {
    workspace.permissions = [];
    workspace.aiEndpoint = {
      provider: 'anthropic',
      chat_model: 'claude-sonnet',
      base_url: 'https://api.anthropic.com/v1',
    };

    expect(await render()).toContain('Anthropic, claude-sonnet');
  });

  it('does not offer reloading sample deals to anyone else', async () => {
    workspace.isOwner = false;

    expect(await render()).not.toContain('Reload sample deals');
  });
});
