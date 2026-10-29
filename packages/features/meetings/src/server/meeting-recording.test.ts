import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendSpy = vi.fn();
const createSignedUploadUrl = vi.fn();
const generateStructured = vi.fn();

const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));

const access = vi.hoisted(() => ({ dealAccount: null as string | null, mayWork: false }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    storage: { from: storageFrom },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => ({
            throwOnError: async () => ({
              data: access.dealAccount && { account_id: access.dealAccount },
            }),
          }),
        }),
      }),
    }),
    rpc: () => ({ throwOnError: async () => ({ data: access.mayWork }) }),
  }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: (_client: unknown, input: unknown) => {
    appendSpy(input);
    return Promise.resolve([{ deal_seq: 1, aggregate_seq: 1 }]);
  },
}));

vi.mock('@odb/ai/server', () => ({
  generateStructured: (input: unknown) => generateStructured(input),
}));

import {
  attachMeetingRecording,
  createMeetingRecordingUploadUrl,
  summarizeMeeting,
} from './meeting-recording';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

const runUploadUrl = createMeetingRecordingUploadUrl as unknown as Action;
const runAttach = attachMeetingRecording as unknown as Action;
const runSummarize = summarizeMeeting as unknown as Action;

const DEAL = '00000000-0000-4000-8000-000000000002';
const MEETING = '00000000-0000-4000-8000-000000000003';
const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const user = { id: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  access.dealAccount = ACCOUNT;
  access.mayWork = true;
});

describe('createMeetingRecordingUploadUrl', () => {
  it('signs an upload under the deal-scoped recording path', async () => {
    createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 's', token: 'tok', path: 'p' },
      error: null,
    });

    const result = await runUploadUrl(
      { deal_id: DEAL, meeting_id: MEETING, filename: 'call.mp4' },
      user,
    );

    expect(storageFrom).toHaveBeenCalledWith('meeting-recordings');
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      `deal/${DEAL}/${MEETING}/call.mp4`,
    );
    expect(result).toMatchObject({
      path: `deal/${DEAL}/${MEETING}/call.mp4`,
      token: 'tok',
      signedUrl: 's',
    });
  });
});

describe('attachMeetingRecording', () => {
  it('records the recording and transcript paths on the meeting via meeting.updated', async () => {
    await runAttach(
      {
        id: MEETING,
        deal_id: DEAL,
        recording_path: `deal/${DEAL}/${MEETING}/call.mp4`,
        transcript_text: 'hello world',
      },
      user,
    );

    const append = appendSpy.mock.calls.at(-1)?.[0] as {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      dealId: string;
      payload: Record<string, unknown>;
    };

    expect(append.eventType).toBe('meeting.updated');
    expect(append.aggregateType).toBe('meeting');
    expect(append.aggregateId).toBe(MEETING);
    expect(append.dealId).toBe(DEAL);
    expect(append.payload).toMatchObject({
      recording_path: `deal/${DEAL}/${MEETING}/call.mp4`,
      transcript_text: 'hello world',
    });
  });
});

describe('summarizeMeeting', () => {
  it('generates a summary from the transcript and stores it via meeting.updated', async () => {
    generateStructured.mockResolvedValue({ ok: true, value: { summary: 'Three decisions made.' } });

    const result = await runSummarize(
      {
        id: MEETING,
        deal_id: DEAL,
        transcript_text: 'long transcript',
      },
      user,
    );

    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { accountId: ACCOUNT, dealId: DEAL } }),
    );

    const append = appendSpy.mock.calls.at(-1)?.[0] as {
      eventType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    };

    expect(append.eventType).toBe('meeting.updated');
    expect(append.aggregateId).toBe(MEETING);
    expect(append.payload).toMatchObject({ summary: 'Three decisions made.' });
    expect(result).toEqual({ ok: true, summary: 'Three decisions made.' });
  });

  it('keeps the meeting without a summary and says why when AI is skipped', async () => {
    generateStructured.mockResolvedValue({ ok: false, reason: 'Connect an AI provider first' });
    appendSpy.mockClear();

    const result = await runSummarize(
      { id: MEETING, deal_id: DEAL, transcript_text: 'long transcript' },
      user,
    );

    expect(result).toEqual({ ok: false, reason: 'Connect an AI provider first' });
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["can't see the deal", () => (access.dealAccount = null)],
    ["can't work the deal", () => (access.mayWork = false)],
  ])('refuses a caller who %s, without calling the AI', async (_case, deny) => {
    deny();

    const result = await runSummarize(
      { id: MEETING, deal_id: DEAL, transcript_text: 'long transcript' },
      user,
    );

    expect(result).toEqual({ ok: false, reason: 'Only the deal team can summarize this meeting.' });
    expect(generateStructured).not.toHaveBeenCalled();
    expect(appendSpy).not.toHaveBeenCalled();
  });
});
