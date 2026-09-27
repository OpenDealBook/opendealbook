import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@tuckin/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({ rpc }),
}));

import { verifyOtpToken } from './verify-otp-token';

describe('verifyOtpToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls verify_nonce and maps a redeemed token to valid', async () => {
    rpc.mockResolvedValue({ data: 'nonce-1', error: null });

    const result = await verifyOtpToken({
      token: '123456',
      purpose: 'email-verification',
    });

    expect(rpc).toHaveBeenCalledWith('verify_nonce', {
      token: '123456',
      purpose: 'email-verification',
    });
    expect(result).toEqual({ valid: true });
  });

  it('maps a rejected token to invalid', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'invalid, expired, or already used token' },
    });

    const result = await verifyOtpToken({
      token: 'bad',
      purpose: 'email-verification',
    });

    expect(result).toEqual({ valid: false });
  });
});
