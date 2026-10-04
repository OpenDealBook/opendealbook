import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendSpy = vi.fn();
const createSignedUploadUrl = vi.fn();
const generateStructured = vi.fn();

const storageFrom = vi.fn(() => ({ createSignedUploadUrl }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ storage: { from: storageFrom } }),
}));

vi.mock('@odb/events', () => ({
  appendDealEvent: (_client: unknown, input: unknown) => {
    appendSpy(input);
    return Promise.resolve([{ deal_seq: 1, aggregate_seq: 1 }]);
  },
}));

vi.mock('@odb/ai/server', () => ({
  generateStructured: (client: unknown, input: unknown) =>
    generateStructured(client, input),
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
    generateStructured.mockResolvedValue({ summary: 'Three decisions made.' });

    const result = await runSummarize(
      {
        id: MEETING,
        deal_id: DEAL,
        account_id: ACCOUNT,
        transcript_text: 'long transcript',
      },
      user,
    );

    expect(generateStructured).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ accountId: ACCOUNT }),
    );

    const append = appendSpy.mock.calls.at(-1)?.[0] as {
      eventType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    };

    expect(append.eventType).toBe('meeting.updated');
    expect(append.aggregateId).toBe(MEETING);
    expect(append.payload).toMatchObject({ summary: 'Three decisions made.' });
    expect(result).toBe('Three decisions made.');
  });
});
