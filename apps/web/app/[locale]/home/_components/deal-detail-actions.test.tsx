// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  deleteDeal: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/deals/server', () => ({ deleteDeal: server.deleteDeal }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: server.push, refresh: server.refresh }),
}));

import { DealHeaderActions } from './deal-detail-actions';

const DEAL_ID = 'd0000000-0000-4000-8000-000000000001';
const NAME = 'Harbor Plumbing';

let container: HTMLDivElement;
let root: Root;

function render(deal: { archived: boolean; isOwner: boolean }) {
  act(() =>
    root.render(
      <DealHeaderActions
        dealId={DEAL_ID}
        dealName={NAME}
        dealsHref={'/home/harbor/deals'}
        stage={'sourcing'}
        stages={[{ key: 'sourcing', label: 'Sourcing' }]}
        listingStatus={'active'}
        {...deal}
      />,
    ),
  );
}

function button(text: string) {
  return [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text,
  );
}

function type(value: string) {
  const input = document.body.querySelector('input[aria-label="Deal name"]') as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  for (const fn of Object.values(server)) {
    fn.mockReset();
  }
  server.deleteDeal.mockResolvedValue({ ok: true, value: undefined });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DealHeaderActions delete', () => {
  it('shows Delete only on an archived deal, and only to the team owner', () => {
    render({ archived: true, isOwner: true });
    expect(button('Delete')).toBeDefined();

    render({ archived: true, isOwner: false });
    expect(button('Delete')).toBeUndefined();

    render({ archived: false, isOwner: true });
    expect(button('Delete')).toBeUndefined();
  });

  it('goes back to the deals list once the deal is deleted', async () => {
    render({ archived: true, isOwner: true });
    act(() => button('Delete')!.click());
    type(NAME);

    await act(async () => button('Delete deal')!.click());

    expect(server.deleteDeal).toHaveBeenCalledWith({
      deal_id: DEAL_ID,
      confirm_name: NAME,
    });
    expect(server.push).toHaveBeenCalledWith('/home/harbor/deals');
  });
});
