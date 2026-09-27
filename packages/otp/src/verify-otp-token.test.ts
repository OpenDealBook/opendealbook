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

  it('maps a valid payload to a typed success result', async () => {
    rpc.mockResolvedValue({
      data: {
        valid: true,
        user_id: 'user-1',
        metadata: { source: 'signup' },
        scopes: ['read'],
        purpose: 'email-verification',
      },
      error: null,
    });

    const result = await verifyOtpToken({
      token: '123456',
      purpose: 'email-verification',
    });

    expect(rpc).toHaveBeenCalledWith('verify_nonce', {
      token: '123456',
      purpose: 'email-verification',
      required_scopes: undefined,
      max_verification_attempts: undefined,
    });
    expect(result).toEqual({
      valid: true,
      userId: 'user-1',
      metadata: { source: 'signup' },
      scopes: ['read'],
      purpose: 'email-verification',
    });
  });

  it('returns an invalid payload without throwing', async () => {
    rpc.mockResolvedValue({
      data: {
        valid: false,
        message: 'invalid, expired, or already used token',
      },
      error: null,
    });

    const result = await verifyOtpToken({
      token: 'bad',
      purpose: 'email-verification',
    });

    expect(result).toEqual({
      valid: false,
      message: 'invalid, expired, or already used token',
      maxAttemptsExceeded: undefined,
    });
  });

  it('surfaces max_attempts_exceeded on the invalid result', async () => {
    rpc.mockResolvedValue({
      data: {
        valid: false,
        message: 'too many attempts',
        max_attempts_exceeded: true,
      },
      error: null,
    });

    const result = await verifyOtpToken({
      token: 'bad',
      purpose: 'email-verification',
    });

    expect(result).toEqual({
      valid: false,
      message: 'too many attempts',
      maxAttemptsExceeded: true,
    });
  });

  it('throws on a transport error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection reset' },
    });

    await expect(
      verifyOtpToken({ token: 'x', purpose: 'email-verification' }),
    ).rejects.toEqual({ message: 'connection reset' });
  });
});
