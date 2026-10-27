// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('./background-search-actions', () => ({
  updateNameSpellingAction: server.save,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { BackgroundSearchSetting } from './background-search';

let container: HTMLDivElement;
let root: Root;

function spellingSelect() {
  return container.querySelector<HTMLSelectElement>(
    'select[aria-label="Show names as"]',
  )!;
}

async function render(canManage: boolean) {
  await act(async () => {
    root.render(
      <BackgroundSearchSetting
        accountId={'team-1'}
        current={'source_priority'}
        canManage={canManage}
      />,
    );
  });
}

async function pick(spelling: string) {
  await act(async () => {
    spellingSelect().value = spelling;
    spellingSelect().dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.save.mockReset().mockResolvedValue({ ok: true, value: undefined });
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

describe('the background search setting', () => {
  it("offers source priority and newest record, showing the team's choice", async () => {
    await render(true);

    expect(container.textContent).toContain('Background search');
    expect(
      [...spellingSelect().options].map((option) => [
        option.value,
        option.textContent,
      ]),
    ).toEqual([
      ['source_priority', 'Source priority'],
      ['newest_record', 'Newest record'],
    ]);
    expect(spellingSelect().value).toBe('source_priority');
  });

  it('saves the choice a settings manager picks', async () => {
    await render(true);

    await pick('newest_record');

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      spelling: 'newest_record',
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('shows why a save was refused', async () => {
    server.save.mockResolvedValue({
      ok: false,
      refusal: 'Changing background search settings needs settings.manage',
    });
    await render(true);

    await pick('newest_record');

    expect(container.querySelector('[role=alert]')?.textContent).toBe(
      'Changing background search settings needs settings.manage',
    );
  });

  it('is read-only for members who cannot manage settings', async () => {
    await render(false);

    expect(spellingSelect().disabled).toBe(true);
  });
});
