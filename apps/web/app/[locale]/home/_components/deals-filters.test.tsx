// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/home/t/deals',
  useSearchParams: () => new URLSearchParams(),
}));

import { DealsFilters } from './deals-filters';

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(
      <DealsFilters
        filters={{}}
        sort={'updated'}
        stageOptions={[]}
        resolutionOptions={[]}
        listingStatusOptions={[]}
        industryOptions={[]}
        locationOptions={[]}
        starredCount={0}
        archivedCount={0}
        examplesCount={4}
      />,
    );
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DealsFilters', () => {
  it('switches the list to example deals from the Examples filter', async () => {
    await render();

    const examples = [...container.querySelectorAll('label')].find((label) =>
      label.textContent?.startsWith('Examples (4)'),
    );
    await act(async () => {
      examples!.querySelector('button')!.click();
    });

    expect(router.replace).toHaveBeenCalledWith('/home/t/deals?examples=1', {
      scroll: false,
    });
  });

  it('offers a Filters button that opens the filter panel in a sheet', async () => {
    await render();

    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Filters',
    );
    await act(async () => {
      button!.click();
    });

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Examples (4)',
    );
  });
});
