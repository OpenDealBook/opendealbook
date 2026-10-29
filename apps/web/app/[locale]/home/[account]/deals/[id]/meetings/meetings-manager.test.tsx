// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ summarize: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/meetings/server', () => ({
  attachMeetingRecording: vi.fn(),
  connectCalendar: vi.fn(),
  createCalendarConnectSession: vi.fn(),
  createMeetingRecordingUploadUrl: vi.fn(),
  pushMeetingToCalendars: vi.fn(),
  scheduleMeeting: vi.fn(),
  summarizeMeeting: server.summarize,
}));
vi.mock('@odb/supabase/hooks', () => ({ useSupabase: () => ({}) }));
vi.mock('@nangohq/frontend', () => ({ default: class {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: server.refresh }) }));

import { MeetingsManager } from './meetings-manager';

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.summarize.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MeetingsManager
        accountId={'team-1'}
        dealId={'deal-1'}
        connections={[]}
        meetings={[
          {
            id: 'meeting-1',
            type: 'weekly',
            scheduled_at: null,
            status: 'scheduled',
            summary: null,
            recording_path: null,
          },
        ]}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function summarize() {
  await act(async () => {
    const transcript = container.querySelector<HTMLTextAreaElement>('textarea[placeholder="Paste transcript"]')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(transcript, 'We agreed terms.');
    transcript.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    [...container.querySelectorAll('button')].find((button) => button.textContent === 'Summarize')!.click();
  });
}

describe('summarizing a meeting', () => {
  it('says why the meeting was kept without a summary', async () => {
    server.summarize.mockResolvedValue({ ok: false, reason: 'The monthly AI limit is reached' });

    await summarize();

    expect(container.textContent).toContain('The monthly AI limit is reached');
  });

  it('shows no error when the summary is saved', async () => {
    server.summarize.mockResolvedValue({ ok: true, summary: 'Terms agreed.' });

    await summarize();

    expect(container.querySelector('.text-destructive')).toBeNull();
  });
});
