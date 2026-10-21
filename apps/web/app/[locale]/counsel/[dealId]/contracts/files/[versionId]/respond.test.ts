import { beforeEach, describe, expect, it, vi } from 'vitest';

const contracts = vi.hoisted(() => ({ file: vi.fn() }));

vi.mock('@odb/contracts', () => ({ contractVersionFile: contracts.file }));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
}));
vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({}),
}));

import { respondWithContractFile } from './respond';

beforeEach(() => {
  contracts.file.mockReset();
});

describe('respondWithContractFile', () => {
  it('downloads a file the viewer may see, under a name without its version', async () => {
    contracts.file.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
      filename: 'contract.pdf',
    });

    const response = await respondWithContractFile('version-1', 'pdf');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="contract.pdf"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('answers not found when the viewer may not see it', async () => {
    contracts.file.mockResolvedValue(null);

    expect((await respondWithContractFile('version-1', 'docx')).status).toBe(
      404,
    );
  });
});
