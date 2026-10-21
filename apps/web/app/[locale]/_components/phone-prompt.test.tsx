// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  answer: vi.fn(),
  skip: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/accounts/server/personal-account-actions', () => ({
  answerPhonePrompt: server.answer,
  skipPhonePrompt: server.skip,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { PhonePrompt } from './phone-prompt';

let container: HTMLDivElement;
let root: Root;

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )!;
}

beforeEach(async () => {
  server.answer.mockReset().mockResolvedValue(undefined);
  server.skip.mockReset().mockResolvedValue(undefined);
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<PhonePrompt />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the phone prompt', () => {
  it('asks for an optional phone', () => {
    const input = container.querySelector<HTMLInputElement>(
      'input[name="phone"]',
    )!;

    expect(container.textContent).toContain('Add a phone number');
    expect(input.required).toBe(false);
    expect(input.maxLength).toBe(50);
  });

  it('saves the phone and moves on', async () => {
    container.querySelector<HTMLInputElement>('input[name="phone"]')!.value =
      '+1 555 0100';

    await act(async () => button('Save').click());

    expect(server.answer).toHaveBeenCalledWith({ phone: '+1 555 0100' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('lets the person skip it', async () => {
    await act(async () => button('Skip').click());

    expect(server.skip).toHaveBeenCalledWith({});
    expect(server.answer).not.toHaveBeenCalled();
    expect(server.refresh).toHaveBeenCalled();
  });
});
