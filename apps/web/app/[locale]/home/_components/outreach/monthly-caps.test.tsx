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
          ai: { cap: 1000, used: 311.2, resetsAt: '2026-12-01T00:00:00.000Z' },
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
  it("shows each kind's cap beside this month's usage, AI in whole credits and dollars with its reset date", async () => {
    await render();

    expect(field('Letters per month').value).toBe('40');
    expect(field('Paid lookups per month').value).toBe('200');
    expect(field('AI credits per month').value).toBe('1000');
    expect(container.textContent).toContain('12 used this month');
    expect(container.textContent).toContain('3 used this month');
    expect(container.textContent).toContain(
      'Used 312 of 1,000 credits ($3.12), resets Dec 1',
    );
  });

  it('says a credit is a cent of model spend, which calls are not counted, and that a call which may not fit what is left waits', async () => {
    await render();

    expect(container.textContent).toContain(
      '1 credit is $0.01 of model spend on your own AI key. Calls to a model without a known price, or to an OpenAI-compatible endpoint without prices entered, are not counted. Each counted call holds the most it could cost until it finishes, so a call that might not fit in what is left waits for next month or a higher cap.',
    );
  });

  it('saves the caps a deal manager enters', async () => {
    await render();

    await type('AI credits per month', '500');
    await save();

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      letterMonthlyCap: 40,
      lookupMonthlyCap: 200,
      aiMonthlyCreditCap: 500,
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

    expect(alertText()).toBe('Changing caps needs deals.manage');
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
