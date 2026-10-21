// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RESUME_STUCK = "Saved, but paused runs couldn't be resumed; try again";

const server = vi.hoisted(() => ({
  save: vi.fn(),
  retry: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('./monthly-caps-actions', () => ({
  saveMonthlyCapsAction: server.save,
  retryResumeCappedRunsAction: server.retry,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { MonthlyCaps } from './monthly-caps';

let container: HTMLDivElement;
let root: Root;

function field(label: string) {
  return container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
}

function alertText() {
  return container.querySelector('[role=alert]')?.textContent;
}

function button(text: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text,
  );
}

async function render() {
  await act(async () => {
    root.render(
      <MonthlyCaps
        accountId={'team-1'}
        caps={{
          letters: { cap: 40, used: 12 },
          lookups: { cap: 200, used: 3 },
          ai: { cap: 0, used: 7 },
        }}
      />,
    );
  });
}

async function type(label: string, value: string) {
  const input = field(label);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function save() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.save
    .mockReset()
    .mockResolvedValue({ ok: true, value: { resumeError: null } });
  server.retry
    .mockReset()
    .mockResolvedValue({ ok: true, value: { resumeError: null } });
  server.refresh.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('the monthly caps setting', () => {
  it("shows each kind's cap beside this month's usage", async () => {
    await render();

    expect(field('Letters per month').value).toBe('40');
    expect(field('Paid lookups per month').value).toBe('200');
    expect(field('AI calls per month').value).toBe('0');
    expect(container.textContent).toContain('12 used this month');
    expect(container.textContent).toContain('3 used this month');
    expect(container.textContent).toContain('7 used this month');
  });

  it('saves the caps a deal manager enters', async () => {
    await render();

    await type('AI calls per month', '500');
    await save();

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      letterMonthlyCap: 40,
      lookupMonthlyCap: 200,
      aiMonthlyCap: 500,
    });
    expect(server.refresh).toHaveBeenCalled();
    expect(alertText()).toBeUndefined();
    expect(button('Try again')).toBeUndefined();
  });

  it('shows why a save was refused', async () => {
    server.save.mockResolvedValue({
      ok: false,
      refusal: 'Changing caps needs deals.manage',
    });
    await render();

    await save();

    expect(alertText()).toBe(
      'Changing caps needs deals.manage',
    );
    expect(button('Try again')).toBeUndefined();
  });

  it('offers to retry resuming paused runs after a save whose resume failed', async () => {
    server.save.mockResolvedValue({
      ok: true,
      value: { resumeError: RESUME_STUCK },
    });
    await render();
    await save();

    expect(alertText()).toBe(RESUME_STUCK);

    await act(async () => button('Try again')!.click());

    expect(server.retry).toHaveBeenCalledWith({ accountId: 'team-1' });
    expect(alertText()).toBeUndefined();
    expect(button('Try again')).toBeUndefined();
  });

  it('keeps offering a retry while paused runs still do not resume', async () => {
    server.save.mockResolvedValue({
      ok: true,
      value: { resumeError: RESUME_STUCK },
    });
    server.retry.mockResolvedValue({
      ok: true,
      value: { resumeError: RESUME_STUCK },
    });
    await render();
    await save();

    await act(async () => button('Try again')!.click());

    expect(alertText()).toBe(RESUME_STUCK);
    expect(button('Try again')).toBeDefined();
  });
});
