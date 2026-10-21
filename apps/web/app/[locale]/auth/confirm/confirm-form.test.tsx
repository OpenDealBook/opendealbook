// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ confirmLenderSignIn: async () => 'expired' }));
vi.mock('@odb/lender-rooms/members/actions.ts', () => ({
  requestLenderSignInLink: vi.fn(),
}));

import { ConfirmSignInForm } from './confirm-form';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ConfirmSignInForm', () => {
  it('offers a fresh link right away when the link was already used', async () => {
    await act(async () => {
      root.render(
        <ConfirmSignInForm
          tokenHash={'hash-1'}
          next={'/lender'}
          destination={'your lender room'}
        />,
      );
    });
    await act(async () => {
      container.querySelector('form')!.requestSubmit();
    });

    expect(container.textContent).toContain(
      "This link was already used. We'll email you a fresh one.",
    );
    expect(container.querySelector('input[name="email"]')).not.toBeNull();
  });
});
