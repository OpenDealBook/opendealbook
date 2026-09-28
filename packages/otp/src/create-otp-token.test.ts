import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc }),
}));

import { createOtpToken } from './create-otp-token';

describe('createOtpToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls create_nonce with the purpose and returns the token', async () => {
    rpc.mockResolvedValue({ data: 'tok_123', error: null });

    const token = await createOtpToken({
      purpose: 'email-verification',
      userId: 'user-1',
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_nonce',
      expect.objectContaining({
        purpose: 'email-verification',
        user_id: 'user-1',
      }),
    );
    expect(token).toBe('tok_123');
  });
});
