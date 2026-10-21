import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import LenderSettingsPage from './page';

const workspace = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('../../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1' },
    permissions: workspace.permissions,
  }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
}));
vi.mock('@odb/lender-rooms/crm/nudges/nudges.ts', () => ({
  fetchQuietDays: async () => 7,
}));
vi.mock('@odb/lender-outreach/template.ts', () => ({
  loadOutreachTemplate: async () => null,
}));
vi.mock('../../../_components/lender-crm/lender-settings', () => ({
  QuietDaysForm: () => <button>Save quiet days</button>,
  OutreachTemplateForm: () => <button>Save template</button>,
}));

async function render() {
  return renderToStaticMarkup(
    await LenderSettingsPage({ params: Promise.resolve({ account: 'acme' }) }),
  );
}

describe('lender settings page', () => {
  it('lets a deal manager edit the lender settings', async () => {
    workspace.permissions = ['deals.manage'];

    expect(await render()).not.toContain('<fieldset disabled=""');
  });

  it('shows anyone else the lender settings locked with the reason', async () => {
    workspace.permissions = ['deals.work'];
    const html = await render();

    expect(html).toContain('Only deal managers can change lender settings.');
    expect(html).toMatch(
      /<fieldset disabled=""[^]*Save quiet days[^]*Save template/,
    );
  });
});
