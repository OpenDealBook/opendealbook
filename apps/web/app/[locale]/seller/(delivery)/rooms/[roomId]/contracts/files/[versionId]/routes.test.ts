import { beforeEach, describe, expect, it, vi } from 'vitest';

const contracts = vi.hoisted(() => ({ file: vi.fn() }));

vi.mock('@odb/contracts', () => ({ contractVersionFile: contracts.file }));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({}),
}));
vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => ({}),
}));

import { GET as getDocx } from './docx/route';
import { GET as getPdf } from './pdf/route';

const context = {
  params: Promise.resolve({ roomId: 'room-1', versionId: 'version-1' }),
};

beforeEach(() => {
  contracts.file.mockReset();
});

describe('seller room contract files', () => {
  it.each([
    ['docx', getDocx],
    ['pdf', getPdf],
  ] as const)(
    'downloads the %s of a version the seller side may see',
    async (kind, get) => {
      contracts.file.mockResolvedValue({
        bytes: new Uint8Array([1]),
        contentType: 'application/octet-stream',
        filename: `contract.${kind}`,
      });

      const response = await get(new Request('http://x'), context);

      expect(response.status).toBe(200);
      expect(contracts.file).toHaveBeenCalledWith({}, {}, 'version-1', kind);
    },
  );

  it('answers not found for a version the seller side may not see', async () => {
    contracts.file.mockResolvedValue(null);

    expect((await getPdf(new Request('http://x'), context)).status).toBe(404);
  });
});
