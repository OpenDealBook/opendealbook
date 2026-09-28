import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuckin/workflows/client', () => ({
  TASK_QUEUE: 'opendealbook',
  getTemporalClient: vi.fn(),
}));

import { workbookScheduleId, workbookWorkflowId } from './schedule';

describe('workbook schedule ids', () => {
  it('derives a stable schedule id from the workbook id', () => {
    expect(workbookScheduleId('wb-1')).toBe('workbook-wb-1');
  });

  it('derives a stable workflow id from the workbook id', () => {
    expect(workbookWorkflowId('wb-1')).toBe('broker-catch-up-wb-1');
  });
});
