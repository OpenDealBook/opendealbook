import { describe, expect, it } from 'vitest';

import { enrollmentStatusLabel } from './enrollment-status';

describe('enrollmentStatusLabel', () => {
  it('shows a held enrollment as awaiting approval', () => {
    expect(enrollmentStatusLabel('held')).toBe('Awaiting approval');
  });

  it('shows every other status as stored', () => {
    expect(enrollmentStatusLabel('queued')).toBe('queued');
  });
});
