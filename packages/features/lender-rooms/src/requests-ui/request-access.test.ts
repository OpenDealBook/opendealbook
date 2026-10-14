import { describe, expect, it } from 'vitest';

import { newestSignature, requestIsInRoom } from './request-access';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const OTHER_ROOM = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';

describe('requestIsInRoom', () => {
  it('accepts a request the person can see in the room named by the address', () => {
    expect(requestIsInRoom({ room_id: ROOM }, ROOM)).toBe(true);
  });

  it('rejects a request that matched nothing the person may see', () => {
    expect(requestIsInRoom(null, ROOM)).toBe(false);
  });

  it('rejects a request that belongs to another room', () => {
    expect(requestIsInRoom({ room_id: OTHER_ROOM }, ROOM)).toBe(false);
  });
});

describe('newestSignature', () => {
  const declined = {
    id: 's1',
    status: 'declined' as const,
    created_at: '2026-10-10T09:00:00+00:00',
  };
  const draft = {
    id: 's2',
    status: 'draft' as const,
    created_at: '2026-10-11T08:00:00+02:00',
  };

  it('is the most recently created of several, whatever order they arrive in', () => {
    expect(newestSignature([declined, draft])).toBe(draft);
    expect(newestSignature([draft, declined])).toBe(draft);
  });

  it('is nothing when the form has never been sent for signature', () => {
    expect(newestSignature([])).toBeUndefined();
  });

  it('is nothing when the newest one was cancelled, even with older ones behind it', () => {
    const cancelled = {
      id: 's3',
      status: 'cancelled' as const,
      created_at: '2026-10-12T09:00:00+00:00',
    };

    expect(newestSignature([declined, draft, cancelled])).toBeUndefined();
  });
});
