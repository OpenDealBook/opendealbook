// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  request: vi.fn(async (_state: unknown, form: FormData) => ({
    email: String(form.get('email')),
    sender: 'Open Deal Book <deals@odb.test>',
  })),
}));

vi.mock('./actions', () => ({ requestSellerSignInLink: server.request }));

import { SellerSignInForm } from './sign-in-form';

let container: HTMLDivElement;
let root: Root;

async function render(email?: string) {
  await act(async () => {
    root.render(<SellerSignInForm next={'/seller'} email={email} />);
  });
}

async function submit() {
  await act(async () => {
    container.querySelector('form')!.requestSubmit();
  });
}

beforeEach(() => {
  server.request.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerSignInForm', () => {
  it('fills in the address it is given', async () => {
    await render('sam@seller.test');

    expect(container.querySelector('input[name="email"]')).toHaveProperty(
      'value',
      'sam@seller.test',
    );
  });

  it('answers the same for any address, names the sender, mentions spam and hides the form', async () => {
    await render('sam@seller.test');
    await submit();

    expect(container.textContent).toContain(
      'If this email has access, we sent a link',
    );
    expect(container.textContent).toContain('sam@seller.test');
    expect(container.textContent).toContain('Open Deal Book <deals@odb.test>');
    expect(container.textContent).toMatch(/spam/i);
    expect(container.querySelector('input[type="email"]')).toBeNull();
  });

  it('sends the link again to the same address', async () => {
    await render('sam@seller.test');
    await submit();
    await submit();

    expect(server.request).toHaveBeenCalledTimes(2);
    const resent = server.request.mock.calls[1]![1];
    expect(resent.get('email')).toBe('sam@seller.test');
    expect(resent.get('next')).toBe('/seller');
  });
});
