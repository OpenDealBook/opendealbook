// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const DEAL = '11111111-1111-4111-8111-111111111111';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
}));
vi.mock('@odb/data-room/uploads/actions', () => ({
  stageUpload: async () => undefined,
  expandUploadBatch: async () => undefined,
}));
vi.mock('@odb/data-room', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/data-room')>()),
  fetchFolders: async () => [
    { id: 'f-fin', parent_id: null, name: 'Financials', sort_order: 0 },
    { id: 'f-leg', parent_id: null, name: 'Legal', sort_order: 1 },
  ],
  fetchDocuments: async () => [],
}));

import { DataRoomSection } from './data-room-section';

async function render() {
  return renderToStaticMarkup(await DataRoomSection({ dealId: DEAL }));
}

describe('DataRoomSection', () => {
  it('offers Upload in every folder', async () => {
    const html = await render();

    expect(html.match(/>Upload</g)).toHaveLength(2);
  });

  it('shows an empty folder as one row with its name, 0 files, and Upload', async () => {
    const html = await render();
    const document = new DOMParser().parseFromString(html, 'text/html');
    const rowOf = (name: string) =>
      [...document.querySelectorAll('*')]
        .filter(
          (element) =>
            element.textContent?.includes(name) &&
            element.textContent.includes('0 files'),
        )
        .at(-1);

    expect(html).not.toContain('No documents');
    expect(rowOf('Financials')?.textContent).toBe('Financials0 filesUpload');
    expect(rowOf('Legal')?.textContent).toBe('Legal0 filesUpload');
  });

  it('does not warn that storage is unprovisioned', async () => {
    const html = await render();

    expect(html).not.toContain('not declared in the database schema');
    expect(html).not.toContain('storage provisioning');
  });
});
