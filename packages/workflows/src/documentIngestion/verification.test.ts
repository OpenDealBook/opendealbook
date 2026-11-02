import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  client: { marker: 'admin-client' } as unknown,
  runVerification: vi.fn(),
  buildDocumentExtractionChecks: vi.fn(async () => [] as unknown[]),
  signalWithStart: vi.fn(),
}));

vi.mock('../client', () => ({
  getTemporalClient: async () => ({
    workflow: { signalWithStart: state.signalWithStart },
  }),
}));

vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: () => state.client,
}));

vi.mock('@odb/verification', () => ({
  runVerification: state.runVerification,
}));

vi.mock('./verificationGather', () => ({
  buildDocumentExtractionChecks: state.buildDocumentExtractionChecks,
}));

vi.mock('@odb/notifications/server', () => ({
  createNovuClient: vi.fn(() => ({ marker: 'novu' })),
  triggerNotification: vi.fn(),
}));

import { requestDealVerification, runDealVerification } from '../activities';
import { CapReached } from '../builder/caps';

beforeEach(() => {
  state.runVerification.mockReset();
  state.buildDocumentExtractionChecks.mockReset();
  state.buildDocumentExtractionChecks.mockResolvedValue([]);
});

describe('runDealVerification', () => {
  it('runs verification for the deal with the ingest trigger', async () => {
    await runDealVerification({ dealId: 'deal1' });

    expect(state.runVerification).toHaveBeenCalledTimes(1);
    expect(state.runVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        client: state.client,
        dealId: 'deal1',
        trigger: 'ingest',
      }),
    );

    const options = state.runVerification.mock.calls[0]![0] as {
      notify: unknown;
      runnableChecks: unknown;
    };
    expect(options.notify).toBeTypeOf('function');
    expect(options.runnableChecks).toEqual([]);

    expect(state.buildDocumentExtractionChecks).toHaveBeenCalledWith(
      expect.objectContaining({ client: state.client, dealId: 'deal1' }),
    );
  });

  it('has the runner skip its run at the AI cap and any other error fail it', async () => {
    await runDealVerification({ dealId: 'deal1' });

    const { skipReason } = state.runVerification.mock.calls[0]![0] as {
      skipReason: (error: unknown) => string | null;
    };
    expect(skipReason(new CapReached())).toBe(
      'The monthly AI limit is reached',
    );
    expect(skipReason(new Error('boom'))).toBeNull();
  });

  it('still fails on any other error', async () => {
    state.runVerification.mockRejectedValue(new Error('boom'));

    await expect(runDealVerification({ dealId: 'deal1' })).rejects.toThrow(
      'boom',
    );
  });
});

describe('requestDealVerification', () => {
  it('signals the deal verification workflow, starting it when none is waiting', async () => {
    await requestDealVerification({ dealId: 'deal1' });

    expect(state.signalWithStart).toHaveBeenCalledWith('dealVerification', {
      taskQueue: 'opendealbook',
      workflowId: 'deal-verification-deal1',
      signal: 'documentIngested',
      args: [{ dealId: 'deal1' }],
    });
  });
});
