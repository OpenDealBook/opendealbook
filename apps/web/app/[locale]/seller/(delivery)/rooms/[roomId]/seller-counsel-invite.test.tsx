// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ invite: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/deal-counsel/invite-seller-counsel.ts', () => ({
  inviteSellerCounsel: server.invite,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { SellerCounselInvite } from './seller-counsel-invite';

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

async function press(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )!;

  await act(async () => {
    button.click();
  });
}

function invite() {
  return press('Invite your counsel');
}

function show(counsel: Counsel[]) {
  act(() =>
    root.render(<SellerCounselInvite dealId={'deal-1'} counsel={counsel} />),
  );
}

type Counsel = Parameters<typeof SellerCounselInvite>[0]['counsel'][number];

const owen: Counsel = {
  name: 'Owen Castillo',
  email: 'owen@law.test',
  invitedAt: '2026-10-19T15:00:00+00:00',
  joined: false,
};

function status() {
  return container.querySelector('[data-invite-status]')?.textContent ?? null;
}

beforeEach(() => {
  server.invite.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  show([]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerCounselInvite', () => {
  it('invites by email alone and confirms', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });
    type('seller-counsel-email', 'sol@law.test');

    await invite();

    expect(server.invite).toHaveBeenCalledWith({
      dealId: 'deal-1',
      email: 'sol@law.test',
    });
    expect(status()).toBe('Invite sent to sol@law.test');
    expect(server.refresh).toHaveBeenCalled();
  });

  it('passes the name when the seller gives one', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });
    type('seller-counsel-name', 'Sol Solicitor');
    type('seller-counsel-email', 'sol@law.test');

    await invite();

    expect(server.invite).toHaveBeenCalledWith({
      dealId: 'deal-1',
      email: 'sol@law.test',
      name: 'Sol Solicitor',
    });
  });

  it('shows the refusal', async () => {
    server.invite.mockResolvedValueOnce({
      ok: false,
      refusal: 'This deal is closed, so counsel cannot be invited.',
    });
    type('seller-counsel-email', 'sol@law.test');

    await invite();

    expect(status()).toBe('This deal is closed, so counsel cannot be invited.');
    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('shows invited counsel, when invited, and whether they have joined, without the blank form', () => {
    show([
      owen,
      { ...owen, name: 'Ada Advocate', email: 'ada@law.test', joined: true },
    ]);

    expect(container.textContent).toContain(
      'Owen Castillo, invited Oct 19, not yet joined',
    );
    expect(container.textContent).toContain(
      'Ada Advocate, invited Oct 19, joined',
    );
    expect(container.querySelector('#seller-counsel-email')).toBeNull();
  });

  it('offers no invite or resend once the room is read-only, leaving the reason to the page banner', () => {
    act(() =>
      root.render(
        <SellerCounselInvite
          dealId={'deal-1'}
          counsel={[owen]}
          readOnly
        />,
      ),
    );

    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('Owen Castillo');
    expect(container.textContent).not.toContain('read-only');
  });

  it('says what counsel can see', () => {
    show([owen]);

    expect(container.textContent).toContain(
      'Your counsel can see and comment on the files, uploads and questions in this room.',
    );
  });

  it('resends the invite to invited counsel', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });
    show([owen]);

    await press('Resend');

    expect(server.invite).toHaveBeenCalledWith({
      dealId: 'deal-1',
      email: 'owen@law.test',
    });
    expect(status()).toBe('Invite sent to owen@law.test');
  });

  it('reveals the form to invite another counsel alongside those invited', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });
    show([owen]);

    await press('Invite another');
    type('seller-counsel-email', 'ada@law.test');
    await invite();

    expect(container.textContent).toContain(
      'Owen Castillo, invited Oct 19, not yet joined',
    );
    expect(server.invite).toHaveBeenCalledWith({
      dealId: 'deal-1',
      email: 'ada@law.test',
    });
    expect(container.querySelector('#seller-counsel-email')).toBeNull();
  });
});
