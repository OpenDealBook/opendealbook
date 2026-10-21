// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from '../../../../home/_components/fake-realtime';

const server = vi.hoisted(() => ({ answer: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/seller-rooms/questions/actions.ts', () => ({
  answerSellerQuestion: server.answer,
}));
const realtime = fakeRealtime();

vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => realtime.client,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
  useParams: () => ({ roomId: 'room-1' }),
}));

import { RoomQuestions } from './room-questions';

const open = {
  id: 'q-1',
  title: 'Customer list?',
  body: 'Your top ten customers',
  status: 'open' as const,
  createdAt: '',
  messages: [],
  files: [],
};
const closed = {
  ...open,
  id: 'q-2',
  title: 'Old question',
  status: 'closed' as const,
};

let container: HTMLDivElement;
let root: Root;

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
}

beforeEach(async () => {
  server.answer.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <RoomQuestions
        teamName={'Acme Partners'}
        askers={{ 'q-1': 'Ana Lee', 'q-2': 'Morgan Reyes' }}
        questions={[open, closed]}
        files={[{ documentId: 'doc-1', name: 'customers.xlsx' }]}
        comments={[
          {
            id: 'c-1',
            question_id: 'q-2',
            author: "Owen Castillo, Walt's counsel",
            body: 'Already covered in the APA',
          },
        ]}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RoomQuestions', () => {
  it('lists the team questions', () => {
    expect(container.textContent).toContain('Questions from Acme Partners');
    expect(container.textContent).toContain('Your top ten customers');
  });

  it('names who asked each question and their team', () => {
    expect(
      [...container.querySelectorAll('article')].map((article) =>
        article.textContent?.includes('Ana Lee, Acme Partners'),
      ),
    ).toEqual([true, false]);
  });

  it('sends a text answer with the files the seller picks', async () => {
    server.answer.mockResolvedValueOnce({ ok: true, value: undefined });
    const answer = container.querySelector<HTMLTextAreaElement>('#answer-q-1')!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!;

    act(() => {
      setter.call(answer, 'Attached');
      answer.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      container
        .querySelector<HTMLInputElement>(
          'input[aria-label="Attach customers.xlsx"]',
        )!
        .click();
    });
    await act(async () => {
      button('Send answer')!.click();
    });

    expect(server.answer).toHaveBeenCalledWith({
      questionId: 'q-1',
      body: 'Attached',
      documentIds: ['doc-1'],
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it("shows seller's counsel comments on their question, labelled as given", () => {
    expect(
      [...container.querySelectorAll('article')].map((article) =>
        article.textContent?.includes(
          "Owen Castillo, Walt's counsel: Already covered in the APA",
        ),
      ),
    ).toEqual([false, true]);
  });

  it('offers no answer form once the room is read-only, leaving the reason to the page banner', async () => {
    await act(async () => {
      root.render(
        <RoomQuestions
          teamName={'Acme Partners'}
          askers={{ 'q-1': 'Ana Lee', 'q-2': 'Morgan Reyes' }}
          questions={[open, closed]}
          files={[{ documentId: 'doc-1', name: 'customers.xlsx' }]}
          comments={[]}
          readOnly
        />,
      );
    });

    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).not.toContain('read-only');
  });

  it('offers no answer form on a closed question', () => {
    expect(container.querySelector('#answer-q-2')).toBeNull();
  });

  it("shows seller's counsel comments posted in this room without a reload", async () => {
    await act(() =>
      realtime.insert('seller_room_comment', {
        room_id: 'room-1',
        body: 'Check the indemnity',
      }),
    );

    expect(server.refresh).toHaveBeenCalled();
  });

  it('stays put when a comment is posted in another room', async () => {
    await act(() =>
      realtime.insert('seller_room_comment', {
        room_id: 'room-2',
        body: 'Elsewhere',
      }),
    );

    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('shows a new comment live even before the room has any questions', async () => {
    await act(async () => {
      root.render(
        <RoomQuestions
          teamName={'Acme Partners'}
          askers={{}}
          questions={[]}
          files={[]}
          comments={[]}
        />,
      );
    });

    await act(() =>
      realtime.insert('seller_room_comment', {
        room_id: 'room-1',
        body: 'On a file',
      }),
    );

    expect(server.refresh).toHaveBeenCalled();
  });
});
