// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/seller-rooms/comments/actions.ts', () => ({
  postSellerRoomComment: server.post,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
  usePathname: () => '/counsel/deal-1/seller-room',
}));

import { CommentForm } from './comment-form';

let container: HTMLDivElement;
let root: Root;

async function comment(text: string) {
  const field = container.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;

  act(() => {
    setter.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container.querySelector('button')!.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.post.mockReset();
  server.refresh.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <CommentForm
        roomId={'room-1'}
        subject={{ question_id: 'q-1' }}
        label={'Comment on Payroll?'}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CommentForm', () => {
  it('posts the comment on its subject and refreshes the room', async () => {
    server.post.mockResolvedValue({ ok: true, value: undefined });

    await comment('Answer with the lease change only');

    expect(server.post).toHaveBeenCalledWith({
      roomId: 'room-1',
      subject: { question_id: 'q-1' },
      body: 'Answer with the lease change only',
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('shows why a comment was refused', async () => {
    server.post.mockResolvedValue({
      ok: false,
      refusal: 'The seller room is closed, so this is read-only.',
    });

    await comment('Too late');

    expect(container.textContent).toContain(
      'The seller room is closed, so this is read-only.',
    );
  });
});
