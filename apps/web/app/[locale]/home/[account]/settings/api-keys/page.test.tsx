import { describe, expect, it, vi } from 'vitest';

const workspace = vi.hoisted(() => ({ permissions: [] as string[] }));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));

vi.mock('../../layout', () => ({
  loadTeamWorkspace: async () => ({
    team: { id: 'team-1', name: 'Team', slug: 'team-one' },
    permissions: workspace.permissions,
  }),
}));

vi.mock('@odb/api/server', () => ({
  listApiKeys: async () => [{ id: 'key-1', name: 'CI' }],
}));

vi.mock('@odb/api/components', () => ({
  ApiKeysManager: () => null,
}));

import TeamApiKeysPage from './page';

const params = Promise.resolve({ locale: 'en', account: 'team-one' });

describe('the team API keys page', () => {
  it('is not found for someone without api_keys.manage', async () => {
    workspace.permissions = ['members.manage', 'settings.manage'];

    await expect(TeamApiKeysPage({ params })).rejects.toThrow('not found');
  });

  it('shows the team keys to someone with api_keys.manage', async () => {
    workspace.permissions = ['api_keys.manage'];

    const page = await TeamApiKeysPage({ params });

    expect(JSON.stringify(page)).toContain('API keys');
  });
});
