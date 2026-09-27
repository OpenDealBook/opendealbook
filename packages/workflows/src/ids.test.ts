import { describe, expect, it } from 'vitest';

import { dealWorkflowId } from './ids';

describe('dealWorkflowId', () => {
  it('derives the workflow id from the deal id', () => {
    expect(dealWorkflowId('abc-123')).toBe('deal-lifecycle-abc-123');
  });
});
