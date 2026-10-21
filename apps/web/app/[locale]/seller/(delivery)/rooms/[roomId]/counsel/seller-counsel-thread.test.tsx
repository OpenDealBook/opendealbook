// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from '../../../../../home/_components/fake-realtime';

const server = vi.hoisted(() => ({
  post: vi.fn(async () => ({ ok: true, value: undefined })),
  refresh: vi.fn(),
  stored: [] as { bucket: string; path: string; file: File }[],
}));

const realtime = fakeRealtime();

vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => ({
    ...realtime.client,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: File) => {
          server.stored.push({ bucket, path, file });
          return { error: null };
        },
      }),
    },
  }),
}));
vi.mock('@odb/seller-rooms/counsel-thread/thread.ts', () => ({
  postSellerCounselMessage: server.post,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
  usePathname: () => '/seller/rooms/room-1/counsel',
}));

import { SellerCounselThread } from './seller-counsel-thread';

let container: HTMLDivElement;
let root: Root;

const messages = [
  {
    id: 'm1',
    author_name: 'Walt Brennan',
    body: 'Should I accept the earnout?',
    created_at: '2026-10-15T14:00:00Z',
    files: [{ id: 'f1', name: 'earnout-memo.pdf' }],
  },
];

function render(readOnlyReason: string | null = null) {
  act(() => {
    root.render(
      <SellerCounselThread
        dealId={'deal-1'}
        readOnlyReason={readOnlyReason}
        messages={messages}
        audience={
          'Private to you and Owen Castillo; Harbor Holdings cannot see this. Owen Castillo gets an email.'
        }
        filesPath={'/seller/rooms/room-1/counsel/files'}
      />,
    );
  });
}

function type(value: string) {
  const field = container.querySelector('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function attach(...files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });

  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function send() {
  const button = [...container.querySelectorAll('button')].find(
    (each) => each.textContent === 'Send',
  )!;

  await act(async () => {
    button.click();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  server.post.mockClear();
  server.refresh.mockClear();
  server.stored.length = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerCounselThread', () => {
  it('shows each message with its author and links its files', () => {
    render();

    expect(container.textContent).toContain('Walt Brennan');
    expect(container.textContent).toContain('Should I accept the earnout?');
    expect(
      container.querySelector('a[href="/seller/rooms/room-1/counsel/files/f1"]')
        ?.textContent,
    ).toBe('earnout-memo.pdf');
  });

  it('marks each message so a notification link lands on it', () => {
    render();

    expect(
      container.querySelector('#seller-counsel-message-m1')?.textContent,
    ).toContain('Should I accept the earnout?');
  });

  it('says who reads the thread and who cannot', () => {
    render();

    expect(container.textContent).toContain(
      'Private to you and Owen Castillo; Harbor Holdings cannot see this. Owen Castillo gets an email.',
    );
  });

  it('stores a chosen file for the thread and sends it with the message', async () => {
    render();
    type('Here is the lease');
    attach(new File(['lease'], 'lease.pdf'));
    await send();

    const [stored] = server.stored;

    expect(stored!.bucket).toBe('seller-counsel-thread');
    expect(stored!.path).toMatch(/^deal-1\/[^/]+\/lease\.pdf$/);
    expect(server.post).toHaveBeenCalledWith({
      dealId: 'deal-1',
      body: 'Here is the lease',
      files: [{ path: stored!.path, size: 5 }],
    });
  });

  it('sends a file with no words', async () => {
    render();
    attach(new File(['lease'], 'lease.pdf'));
    await send();

    expect(server.post).toHaveBeenCalledWith({
      dealId: 'deal-1',
      body: '',
      files: [{ path: server.stored[0]!.path, size: 5 }],
    });
  });

  it('refuses a file the data room refuses before storing it', async () => {
    render();
    attach(new File(['call'], 'call.mp4'));
    await send();

    expect(container.textContent).toContain(
      'call.mp4 cannot be uploaded: video and audio files are not allowed',
    );
    expect(server.stored).toEqual([]);
    expect(server.post).not.toHaveBeenCalled();
  });

  it('refuses more than 20 files before storing any', async () => {
    render();
    attach(
      ...Array.from(
        { length: 21 },
        (_, index) => new File(['page'], `page-${index}.pdf`),
      ),
    );
    await send();

    expect(container.textContent).toContain(
      'Attach at most 20 files to one message.',
    );
    expect(server.stored).toEqual([]);
    expect(server.post).not.toHaveBeenCalled();
  });

  it('refuses a message over 10,000 characters before sending', async () => {
    render();
    type('x'.repeat(10_001));
    await send();

    expect(container.textContent).toContain(
      'A message can be at most 10,000 characters.',
    );
    expect(server.post).not.toHaveBeenCalled();
  });

  it('shows the thread read-only, with the reason, once posting has ended', () => {
    render('The seller room is closed, so this thread is read-only.');

    expect(container.textContent).toContain('Should I accept the earnout?');
    expect(container.textContent).toContain(
      'The seller room is closed, so this thread is read-only.',
    );
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('shows a new message the moment the other side posts it', async () => {
    render();

    await act(async () => {
      await realtime.insert('seller_counsel_message', { deal_id: 'deal-1' });
    });

    expect(server.refresh).toHaveBeenCalled();
  });
});
