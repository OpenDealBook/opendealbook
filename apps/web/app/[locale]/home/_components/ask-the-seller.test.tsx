// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  ask: vi.fn(),
  askAbout: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/seller-rooms/questions/actions.ts', () => ({
  askSeller: server.ask,
  askSellerAboutLenderAsk: server.askAbout,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { AskTheSeller } from './ask-the-seller';

let container: HTMLDivElement;
let root: Root;

function type(id: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `#${id}`,
  )!;
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(field),
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )!;
}

async function render(target: { lenderAskId: string } | { dealId: string }) {
  await act(async () => {
    root.render(<AskTheSeller {...target} />);
  });
  await act(async () => {
    button('Ask the seller').click();
  });
  type('seller-question-title', 'Customer list?');
  type('seller-question-body', 'Top ten customers');
}

beforeEach(() => {
  server.ask.mockReset();
  server.askAbout.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AskTheSeller', () => {
  it('asks the seller about a lender request in the team words', async () => {
    server.askAbout.mockResolvedValueOnce({ ok: true, value: 'q-1' });
    await render({ lenderAskId: 'ask-1' });

    await act(async () => {
      button('Send to the seller room').click();
    });

    expect(server.askAbout).toHaveBeenCalledWith({
      lenderAskId: 'ask-1',
      title: 'Customer list?',
      body: 'Top ten customers',
    });
    expect(container.textContent).toContain('Asked in the seller room');
  });

  it('asks the seller directly from the deal', async () => {
    server.ask.mockResolvedValueOnce({ ok: true, value: 'q-2' });
    await render({ dealId: 'deal-1' });

    await act(async () => {
      button('Send to the seller room').click();
    });

    expect(server.ask).toHaveBeenCalledWith({
      dealId: 'deal-1',
      title: 'Customer list?',
      body: 'Top ten customers',
    });
  });

  it('says why a question was refused', async () => {
    server.askAbout.mockResolvedValueOnce({
      ok: false,
      refusal: 'Seller email is not set up',
    });
    await render({ lenderAskId: 'ask-1' });

    await act(async () => {
      button('Send to the seller room').click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Seller email is not set up',
    );
  });
});
