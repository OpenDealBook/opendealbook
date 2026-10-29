// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  deleteDeal: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/deals/server', () => ({ deleteDeal: server.deleteDeal }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { DealRowActions } from './deal-row-actions';

const DEAL_ID = 'd0000000-0000-4000-8000-000000000001';
const NAME = 'Harbor Plumbing';

let container: HTMLDivElement;
let root: Root;

function render(deal: { archived: boolean; isOwner: boolean }) {
  act(() =>
    root.render(
      <DealRowActions
        dealId={DEAL_ID}
        dealName={NAME}
        starred={false}
        {...deal}
      />,
    ),
  );
}

function openMenu() {
  const trigger = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Actions',
  )!;
  act(() => {
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

function menuItem(text: string) {
  return [...document.body.querySelectorAll('[role="menuitem"]')].find(
    (candidate) => candidate.textContent === text,
  ) as HTMLElement | undefined;
}

function button(text: string) {
  return [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text,
  )!;
}

function type(value: string) {
  const input = document.body.querySelector('input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  server.deleteDeal.mockReset();
  server.refresh.mockReset();
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

describe('DealRowActions delete', () => {
  it('offers Delete on an archived deal to the team owner', () => {
    render({ archived: true, isOwner: true });
    openMenu();

    expect(menuItem('Delete')).toBeDefined();
  });

  it('does not offer Delete to anyone but the team owner', () => {
    render({ archived: true, isOwner: false });
    openMenu();

    expect(menuItem('Archive')).toBeUndefined();
    expect(menuItem('Unarchive')).toBeDefined();
    expect(menuItem('Delete')).toBeUndefined();
  });

  it('does not offer Delete on a deal that is not archived', () => {
    render({ archived: false, isOwner: true });
    openMenu();

    expect(menuItem('Archive')).toBeDefined();
    expect(menuItem('Delete')).toBeUndefined();
  });

  it('deletes only once the deal name is typed exactly, then refreshes', async () => {
    render({ archived: true, isOwner: true });
    openMenu();
    act(() => menuItem('Delete')!.click());

    expect(button('Delete deal').disabled).toBe(true);

    type('harbor plumbing');
    expect(button('Delete deal').disabled).toBe(true);

    type(NAME);
    expect(button('Delete deal').disabled).toBe(false);

    await act(async () => button('Delete deal').click());

    expect(server.deleteDeal).toHaveBeenCalledWith({
      deal_id: DEAL_ID,
      confirm_name: NAME,
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('shows why a delete was refused', async () => {
    server.deleteDeal.mockResolvedValue({
      ok: false,
      refusal:
        "Seller's counsel can read this deal until January 15, 2028. You can delete it after that.",
    });
    render({ archived: true, isOwner: true });
    openMenu();
    act(() => menuItem('Delete')!.click());
    type(NAME);

    await act(async () => button('Delete deal').click());

    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Seller's counsel can read this deal until January 15, 2028. You can delete it after that.",
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });
});
