// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refusal = vi.hoisted(() => ({ create: '', revoke: '' }));

vi.mock('@odb/api/server', () => ({
  createApiKey: async () => ({ ok: false, refusal: refusal.create }),
  revokeApiKey: async () => ({ ok: false, refusal: refusal.revoke }),
  listApiKeys: async () => [],
}));

import { ApiKeysManager } from '@odb/api/components';

const liveKey = {
  id: 'key-1',
  name: 'Reporting',
  key_prefix: 'odb_rep',
  scopes: ['read'],
  last_used_at: null,
  revoked_at: null,
  created_at: '2026-10-01T00:00:00Z',
};

function show() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  act(() =>
    createRoot(container).render(
      <ApiKeysManager accountId={'team-1'} initialKeys={[liveKey]} />,
    ),
  );
}

function button(name: string) {
  return [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  )!;
}

function typeName(value: string) {
  const input = document.querySelector<HTMLInputElement>('#api-key-name')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
    input,
    value,
  );
  act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the API keys manager', () => {
  it('shows a refused create next to the create control', async () => {
    refusal.create = 'This team is read-only until billing is updated.';
    show();

    typeName('CI');
    await act(async () => button('Create key').click());

    const alert = document.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain(refusal.create);
    expect(
      button('Create key').closest('[data-slot=card]')!.contains(alert),
    ).toBe(true);
  });

  it('shows a refused revoke on the key it was for', async () => {
    refusal.revoke = 'You cannot revoke this API key.';
    show();

    await act(async () => button('Revoke').click());

    const alert = document.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain(refusal.revoke);
    expect(
      button('Revoke').closest('[data-slot=card]')!.textContent,
    ).toContain('Reporting');
    expect(button('Revoke').closest('[data-slot=card]')!.contains(alert)).toBe(
      true,
    );
  });
});
