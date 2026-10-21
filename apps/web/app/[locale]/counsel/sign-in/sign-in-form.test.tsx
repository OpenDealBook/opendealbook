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

vi.mock('./actions', () => ({ requestCounselSignInLink: server.request }));

import { CounselSignInForm } from './sign-in-form';

let container: HTMLDivElement;
let root: Root;

async function render(email?: string) {
  await act(async () => {
    root.render(<CounselSignInForm next={'/counsel'} email={email} />);
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

describe('CounselSignInForm', () => {
  it('fills in the address it is given', async () => {
    await render('olu@counsel.test');

    expect(container.querySelector('input[name="email"]')).toHaveProperty(
      'value',
      'olu@counsel.test',
    );
  });

  it('answers the same for any address, names the sender, mentions spam and hides the form', async () => {
    await render('olu@counsel.test');
    await submit();

    expect(container.textContent).toContain(
      'If this email has access, we sent a link',
    );
    expect(container.textContent).toContain('olu@counsel.test');
    expect(container.textContent).toContain('Open Deal Book <deals@odb.test>');
    expect(container.textContent).toMatch(/spam/i);
    expect(container.querySelector('input[type="email"]')).toBeNull();
  });

  it('sends the link again to the same address', async () => {
    await render('olu@counsel.test');
    await submit();
    await submit();

    expect(server.request).toHaveBeenCalledTimes(2);
    const resent = server.request.mock.calls[1]![1];
    expect(resent.get('email')).toBe('olu@counsel.test');
    expect(resent.get('next')).toBe('/counsel');
  });
});
