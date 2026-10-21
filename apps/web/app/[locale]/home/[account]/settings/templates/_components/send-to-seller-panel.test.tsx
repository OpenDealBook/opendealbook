// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('@odb/templates/server', () => ({
  sendToSellerAction: server.send,
}));

import { SendToSellerPanel } from './send-to-seller-panel';

let container: HTMLDivElement;
let root: Root;

function input(id: string) {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}

function type(id: string, value: string) {
  const field = input(id);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function send() {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Send to seller',
  )!;

  await act(async () => {
    button.click();
  });
}

function status() {
  return container.querySelector('[data-send-status]')?.textContent ?? null;
}

beforeEach(() => {
  server.send.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<SendToSellerPanel generatedDocumentId={'gen-1'} />));
  type('seller-name', 'Sam Seller');
  type('seller-email', 'sam@seller.test');
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SendToSellerPanel', () => {
  it('sends the seller name and email and confirms', async () => {
    server.send.mockResolvedValueOnce({
      kind: 'sent',
      share: { id: 'share-1' },
    });

    await send();

    expect(server.send).toHaveBeenCalledWith({
      generatedDocumentId: 'gen-1',
      recipientName: 'Sam Seller',
      recipientEmail: 'sam@seller.test',
      permission: 'view',
    });
    expect(status()).toBe('Sent to seller');
  });

  it('says when seller email is not set up', async () => {
    server.send.mockResolvedValueOnce({
      kind: 'refused',
      reason: 'sender-not-set-up',
    });

    await send();

    expect(status()).toBe('Seller email is not set up');
  });

  it('says how many were sent and when to try again at the daily limit', async () => {
    const retryAfter = '2026-10-16T14:05:00+00:00';
    server.send.mockResolvedValueOnce({
      kind: 'refused',
      reason: 'limit',
      sent: 10,
      retryAfter,
    });

    await send();

    expect(status()).toBe(
      `This team has sent 10 documents to sellers in the last 24 hours. Try again after ${new Date(retryAfter).toLocaleString()}.`,
    );
  });

  it('says when the team is read-only for billing', async () => {
    server.send.mockResolvedValueOnce({
      kind: 'refused',
      reason: 'team-locked',
    });

    await send();

    expect(status()).toBe('This team is read-only until billing is updated.');
  });

  it('says when sending to sellers is turned off', async () => {
    server.send.mockResolvedValueOnce({
      kind: 'refused',
      reason: 'sending-off',
    });

    await send();

    expect(status()).toBe('Sending to sellers is turned off for this team.');
  });

  it('shows an inline error when the send fails', async () => {
    server.send.mockRejectedValueOnce(new Error('boom'));

    await send();

    expect(status()).toBe('The document was not sent. Try again.');
  });

  it('clears the outcome when a field changes', async () => {
    server.send.mockResolvedValueOnce({
      kind: 'sent',
      share: { id: 'share-1' },
    });
    await send();

    type('seller-email', 'other@seller.test');

    expect(status()).toBeNull();
  });
});
