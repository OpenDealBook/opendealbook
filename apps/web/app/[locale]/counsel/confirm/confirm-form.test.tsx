// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ confirmCounsel: async () => 'expired' }));
vi.mock('../sign-in/actions', () => ({ requestCounselSignInLink: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ email: 'olu@counsel.test' }),
}));

import { ConfirmCounselSignInForm } from './confirm-form';

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

describe('ConfirmCounselSignInForm', () => {
  it('offers a fresh link to the same address when the link was already used', async () => {
    await act(async () => {
      root.render(
        <ConfirmCounselSignInForm tokenHash={'hash-1'} next={'/counsel'} />,
      );
    });
    await act(async () => {
      container.querySelector('form')!.requestSubmit();
    });

    expect(container.textContent).toContain(
      "This link was already used. We'll email you a fresh one.",
    );
    expect(container.querySelector('input[name="email"]')).toHaveProperty(
      'value',
      'olu@counsel.test',
    );
  });
});
