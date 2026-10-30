import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({
  document_template: [
    {
      id: 'tpl-1',
      name: 'Standard extension',
      type: 'loi_extension',
      version: 1,
    },
  ],
  template_field: [],
}));

vi.mock('../../layout', () => ({
  loadTeamWorkspace: async () => ({ team: { id: 'account-1' } }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: keyof typeof rows) => {
      const result = { data: rows[table] };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => result,
        order: () => result,
      };

      return query;
    },
  }),
}));

import TemplatesPage from './page';

describe('TemplatesPage', () => {
  it('shows the readable type of each template', async () => {
    const page = await TemplatesPage({
      params: Promise.resolve({ locale: 'en', account: 'acme' }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('>LOI extension<');
  });
});
