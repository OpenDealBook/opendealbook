// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ forward: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/seller-rooms/questions/actions.ts', () => ({
  forwardSellerAnswer: server.forward,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { SellerRoomQuestions } from './seller-room-questions';

const routed = {
  id: 'q-1',
  title: 'Customer list?',
  body: null,
  status: 'answered' as const,
  createdAt: '2026-10-15T10:00:00Z',
  fromLenderAsk: true,
  messages: [
    {
      id: 'm-1',
      side: 'seller' as const,
      body: 'here it is, thx',
      createdAt: '',
    },
  ],
  files: [
    { documentId: 'doc-1', name: 'customers.xlsx', side: 'seller' as const },
  ],
};

const direct = { ...routed, id: 'q-2', title: 'Lease?', fromLenderAsk: false };

let container: HTMLDivElement;
let root: Root;

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
}

beforeEach(async () => {
  server.forward.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SellerRoomQuestions questions={[routed, direct]} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerRoomQuestions', () => {
  it('shows each question with the seller answer and files', () => {
    expect(container.textContent).toContain('Customer list?');
    expect(container.textContent).toContain('here it is, thx');
    expect(container.textContent).toContain('customers.xlsx');
  });

  it('sends the edited answer and the chosen files back to the lender', async () => {
    server.forward.mockResolvedValueOnce({ ok: true, value: undefined });
    const draft = container.querySelector<HTMLTextAreaElement>('#forward-q-1')!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!;

    act(() => {
      setter.call(draft, 'The seller has shared the customer list.');
      draft.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      button('Send to the lender')!.click();
    });

    expect(server.forward).toHaveBeenCalledWith({
      questionId: 'q-1',
      body: 'The seller has shared the customer list.',
      documentIds: ['doc-1'],
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('gives each question an address the activity table can link to', () => {
    expect(
      container.querySelector('#seller-question-q-2')?.textContent,
    ).toContain('Lease?');
  });

  it('offers no lender send for a question the team asked directly', () => {
    expect(container.querySelector('#forward-q-2')).toBeNull();
  });
});
