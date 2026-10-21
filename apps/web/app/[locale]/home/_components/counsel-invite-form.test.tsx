// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ invite: vi.fn() }));

vi.mock('@odb/deal-counsel/invite-buyer-counsel.ts', () => ({
  inviteBuyerCounsel: server.invite,
}));

import { CounselInviteForm } from './counsel-invite-form';

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
    (candidate) => candidate.textContent === "Invite buyer's counsel",
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
  act(() => root.render(<CounselInviteForm dealId={'deal-1'} blockedReason={null} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CounselInviteForm', () => {
  it('invites by email alone and confirms', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });
    type('counsel-invite-email', 'ada@law.test');

    await invite();

    expect(server.invite).toHaveBeenCalledWith({
      dealId: 'deal-1',
      email: 'ada@law.test',
    });
    expect(status()).toBe('Invite sent to ada@law.test');
  });

  it('passes the name when the team gives one', async () => {
    server.invite.mockResolvedValueOnce({ ok: true, value: undefined });
    type('counsel-invite-name', 'Ada Attorney');
    type('counsel-invite-email', 'ada@law.test');

    await invite();

    expect(server.invite).toHaveBeenCalledWith({
      dealId: 'deal-1',
      email: 'ada@law.test',
      name: 'Ada Attorney',
    });
  });

  it('shows the refusal', async () => {
    server.invite.mockResolvedValueOnce({
      ok: false,
      refusal: 'This team is read-only until billing is updated.',
    });
    type('counsel-invite-email', 'ada@law.test');

    await invite();

    expect(status()).toBe('This team is read-only until billing is updated.');
  });

  it('is disabled and says why for someone who cannot invite', () => {
    act(() =>
      root.render(
        <CounselInviteForm
          dealId={'deal-1'}
          blockedReason={'Only deal managers can invite counsel. Ask Morgan Reyes.'}
        />,
      ),
    );
    type('counsel-invite-email', 'ada@law.test');

    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === "Invite buyer's counsel",
    )!;
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain(
      'Only deal managers can invite counsel. Ask Morgan Reyes.',
    );
  });
});
