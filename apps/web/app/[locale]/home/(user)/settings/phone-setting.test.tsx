// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/accounts/server/personal-account-actions', () => ({
  updatePersonalPhoneAction: server.save,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { PhoneSetting } from './phone-setting';

let container: HTMLDivElement;
let root: Root;

function phoneInput() {
  return container.querySelector<HTMLInputElement>('input[name="phone"]')!;
}

async function render(current: string | null) {
  await act(async () => {
    root.render(<PhoneSetting current={current} />);
  });
}

beforeEach(() => {
  server.save.mockReset().mockResolvedValue({ success: true });
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

describe('the phone setting', () => {
  it('shows the saved phone, which is optional', async () => {
    await render('+1 555 0100');

    expect(phoneInput().value).toBe('+1 555 0100');
    expect(phoneInput().required).toBe(false);
    expect(phoneInput().maxLength).toBe(50);
  });

  it('saves the phone the person types', async () => {
    await render(null);

    phoneInput().value = '+1 555 0177';
    await act(async () => {
      container.querySelector('form')!.requestSubmit();
    });

    expect(server.save).toHaveBeenCalledWith({ phone: '+1 555 0177' });
    expect(server.refresh).toHaveBeenCalled();
  });
});
