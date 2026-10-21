// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ invite: vi.fn() }));

vi.mock('@odb/seller-rooms/members/actions.ts', () => ({
  inviteSeller: server.invite,
}));

import { SellerRoomInvite } from './seller-room-invite';

let container: HTMLDivElement;
let root: Root;

function type(id: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(`#${id}`)!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function invite() {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Invite seller',
  )!;

  await act(async () => {
    button.click();
  });
}

function status() {
  return container.querySelector('[data-invite-status]')?.textContent ?? null;
}

beforeEach(() => {
  server.invite.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<SellerRoomInvite dealId={'deal-1'} blockedReason={null} />));
  type('seller-invite-name', 'Sam Seller');
  type('seller-invite-email', 'sam@seller.test');
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerRoomInvite', () => {
  it('invites the seller by name and email and confirms', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });

    await invite();

    expect(server.invite).toHaveBeenCalledWith({
      dealId: 'deal-1',
      name: 'Sam Seller',
      email: 'sam@seller.test',
    });
    expect(status()).toBe('Invite sent to sam@seller.test');
  });

  it('shows why an invite was refused', async () => {
    server.invite.mockResolvedValueOnce({
      ok: false,
      refusal: 'Seller email is not set up',
    });

    await invite();

    expect(status()).toBe('Seller email is not set up');
  });

  it('shows an inline error when the invite fails', async () => {
    server.invite.mockRejectedValueOnce(new Error('boom'));

    await invite();

    expect(status()).toBe('The invite was not sent. Try again.');
  });

  it('clears the outcome when a field changes', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });
    await invite();

    type('seller-invite-email', 'other@seller.test');

    expect(status()).toBeNull();
  });

  it('is disabled and says why for someone who cannot invite', () => {
    act(() =>
      root.render(
        <SellerRoomInvite
          dealId={'deal-1'}
          blockedReason={'Only deal managers can invite sellers. Ask Morgan Reyes.'}
        />,
      ),
    );

    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Invite seller',
    )!;
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain(
      'Only deal managers can invite sellers. Ask Morgan Reyes.',
    );
  });
});
