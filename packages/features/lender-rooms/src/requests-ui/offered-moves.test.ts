import { describe, expect, it } from 'vitest';

import { offeredMoves } from './offered-moves';

const RESPONDED = '2026-10-12T10:00:00.000Z';

describe('offeredMoves', () => {
  it('offers everything on an open request we have not responded to', () => {
    expect(offeredMoves({ status: 'open', first_response_at: null })).toEqual([
      'reply',
      'edit',
      'withdraw',
      'close',
    ]);
  });

  it('stops offering edit and withdraw once we have responded', () => {
    expect(
      offeredMoves({ status: 'open', first_response_at: RESPONDED }),
    ).toEqual(['reply', 'close']);
    expect(
      offeredMoves({ status: 'answered', first_response_at: RESPONDED }),
    ).toEqual(['reply', 'close']);
  });

  it('offers only a reply on a closed request', () => {
    expect(
      offeredMoves({ status: 'closed', first_response_at: RESPONDED }),
    ).toEqual(['reply']);
  });

  it('offers reply and close on a withdrawn request', () => {
    expect(
      offeredMoves({ status: 'withdrawn', first_response_at: null }),
    ).toEqual(['reply', 'close']);
  });
});
