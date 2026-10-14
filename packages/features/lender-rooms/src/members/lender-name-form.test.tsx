// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  saved: [] as string[],
  skipped: 0,
  refreshed: 0,
}));

vi.mock('./actions', () => ({
  setMyLenderName: async ({ name }: { name: string }) => {
    server.saved.push(name);

    return { ok: true, value: undefined };
  },
  skipLenderNamePrompt: async () => {
    server.skipped += 1;

    return { ok: true, value: undefined };
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {
      server.refreshed += 1;
    },
  }),
}));

import { LenderNameForm } from './lender-name-form';

describe('LenderNameForm', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: Parameters<typeof LenderNameForm>[0]) {
    act(() => root.render(<LenderNameForm {...props} />));
  }

  function button(label: string) {
    return [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === label,
    );
  }

  beforeEach(() => {
    server.saved = [];
    server.skipped = 0;
    server.refreshed = 0;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('asks for "Your name", saves what the person types, and reloads the page', async () => {
    render({ initialName: null, allowSkip: true });
    const input = container.querySelector('input')!;
    expect(container.querySelector('label')?.textContent).toBe('Your name');

    input.value = 'Sam Ortiz';
    await act(async () => {
      button('Save')!.click();
    });

    expect(server.saved).toEqual(['Sam Ortiz']);
    expect(server.refreshed).toBe(1);
  });

  it('lets the person skip, and reloads the page without saving a name', async () => {
    render({ initialName: null, allowSkip: true });

    await act(async () => {
      button('Skip')!.click();
    });

    expect(server.skipped).toBe(1);
    expect(server.saved).toEqual([]);
    expect(server.refreshed).toBe(1);
  });

  it('offers no skip when changing an existing name, and starts from that name', () => {
    render({ initialName: 'Dana Lee', allowSkip: false });

    expect(container.querySelector('input')!.value).toBe('Dana Lee');
    expect(button('Skip')).toBeUndefined();
  });
});
