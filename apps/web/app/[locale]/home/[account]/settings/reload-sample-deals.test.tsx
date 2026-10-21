// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  reloadSampleData: vi.fn(async () => ({
    ok: false as const,
    refusal: "Example deals couldn't be loaded. Try again.",
  })),
}));

vi.mock('../../_lib/trial-actions', () => server);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

import { ReloadSampleDeals } from './reload-sample-deals';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

it('shows why the sample deals could not be reloaded', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  document.body.append(container);
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });

  act(() => root.render(<ReloadSampleDeals accountId={'team-1'} />));
  await act(async () => container.querySelector('button')!.click());

  expect(server.reloadSampleData).toHaveBeenCalledWith({ accountId: 'team-1' });
  expect(container.querySelector('[role=alert]')!.textContent).toBe(
    "Example deals couldn't be loaded. Try again.",
  );
});
