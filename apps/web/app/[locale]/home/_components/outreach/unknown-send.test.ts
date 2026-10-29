import { describe, expect, it } from 'vitest';

import { awaitsUnknownSend } from './unknown-send';

const unknownSends = [{ enrollment_id: 'e1', step_id: 2 }];
const waiting = { id: 'e1', status: 'queued', current_step: 2 };

describe('awaitsUnknownSend', () => {
  it('flags a queued enrollment whose current step was sent with an unknown result', () => {
    expect(awaitsUnknownSend(waiting, unknownSends)).toBe(true);
  });

  it('flags a held enrollment whose current step was sent with an unknown result', () => {
    expect(awaitsUnknownSend({ ...waiting, status: 'held' }, unknownSends)).toBe(true);
  });

  it('leaves out an enrollment that left the queue', () => {
    expect(awaitsUnknownSend({ ...waiting, status: 'failed' }, unknownSends)).toBe(false);
  });

  it('ignores an unknown send on an earlier step', () => {
    expect(awaitsUnknownSend({ ...waiting, current_step: 3 }, unknownSends)).toBe(false);
  });

  it('ignores an unknown send on another enrollment', () => {
    expect(awaitsUnknownSend({ ...waiting, id: 'e2' }, unknownSends)).toBe(false);
  });
});
