// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odb/deals/server', () => ({}));

let pathname: string;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => pathname,
}));

import { DealHeader } from './deal-header';

const MANAGERS_ONLY =
  'Only deal managers can change the stage, listing, earnings basis or outcome, archive the deal, or re-extract it.';

const deal: ComponentProps<typeof DealHeader>['deal'] = {
  id: 'd0000000-0000-4000-8000-000000000001',
  description: 'HVAC service business in Ohio; 70% recurring maintenance.',
  code_name: null,
  firm: { name: 'Brennan Climate Services', name_confirmed: true },
  deal_profile: {
    industry_id: null,
    industry: 'HVAC',
    location_raw: null,
    employee_band: null,
    website: null,
    owner_role: null,
    reason_for_sale: null,
    year_established: null,
  },
  stage: 'sourcing',
  capture_method: 'manual',
  resolution: null,
  resolution_reason: null,
  listing_status: 'active',
  archived_at: null,
  asking_price: 2_000_000,
  revenue_ttm: 1_000_000,
  sde_ttm: 700_000,
  ebitda_ttm: 500_000,
  earnings_basis: 'sde',
};

const stages = [
  { key: 'sourcing', label: 'Sourcing' },
  { key: 'loi', label: 'LOI' },
];

let container: HTMLDivElement;
let root: Root;

function render(props: Partial<ComponentProps<typeof DealHeader>> = {}) {
  act(() =>
    root.render(
      <DealHeader
        deal={deal}
        financials={null}
        stages={stages}
        starred={false}
        canManage={true}
        isOwner={false}
        dealsHref={'/home/harbor/deals'}
        industries={[]}
        otherBusinessNames={[]}
        tabs={null}
        {...props}
      />,
    ),
  );
}

function button(text: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text,
  )!;
}

function openMenu() {
  const trigger = container.querySelector('[aria-label="More deal actions"]')!;
  act(() => {
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

function menuItems() {
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

function menuItem(text: string) {
  return menuItems().find((item) => item.textContent === text)!;
}

function dialog() {
  return document.querySelector('[role="dialog"]');
}

function value(label: string) {
  return [...container.querySelectorAll('dt')].find(
    (candidate) => candidate.textContent === label,
  )!.nextElementSibling!;
}

function figure(label: string) {
  return value(label).textContent;
}

beforeEach(() => {
  pathname = `/home/harbor/deals/${deal.id}/financials`;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DealHeader', () => {
  it('lets the team owner delete an archived deal by typing its business name', () => {
    render({
      deal: { ...deal, archived_at: '2026-10-01T00:00:00Z' },
      isOwner: true,
    });

    openMenu();
    act(() => menuItem('Delete').click());

    expect(document.body.textContent).toContain(
      'Type Brennan Climate Services to confirm.',
    );
  });

  it('names the deal by its business name with its stage and a way back to Deals', () => {
    render();

    expect(container.querySelector('h1')!.textContent).toBe(
      'Brennan Climate Services',
    );
    expect(container.textContent).toContain('Sourcing');
    const back = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === 'Deals',
    )!;
    expect(back.getAttribute('href')).toBe('/home/harbor/deals');
  });

  it('shows the stage once, through its select', () => {
    render();

    expect(container.textContent!.split('Sourcing')).toHaveLength(2);
  });

  it('keeps the stage and the deal profile in view and moves the rest into the overflow menu', () => {
    render({
      deal: { ...deal, archived_at: '2026-10-01T00:00:00Z' },
      isOwner: true,
    });

    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(1);
    expect(button('Deal profile')).toBeDefined();
    for (const secondary of [
      'Re-extract with AI',
      'Star',
      'Mark won',
      'Mark lost',
      'Unarchive',
      'Delete',
    ]) {
      expect(button(secondary)).toBeUndefined();
    }

    openMenu();

    expect(menuItems().map((item) => item.textContent)).toEqual([
      'Star',
      'Listing status',
      'Earnings basis',
      'Re-extract with AI',
      'Mark won',
      'Mark lost',
      'Unarchive',
      'Delete',
    ]);
  });

  it('leaves the asking figures to the overview summary strip on the overview', () => {
    pathname = `/home/harbor/deals/${deal.id}`;
    render();

    expect(container.querySelector('dl')).toBeNull();
    expect(container.textContent).toContain('Sourcing');
  });

  it('shows the asking figures on every other tab', () => {
    pathname = `/home/harbor/deals/${deal.id}/documents`;
    render();

    expect(figure('Asking')).toBe('$2M');
    expect(figure('Asking multiple (SDE)')).toBe('2.9x');
  });

  it('shows trailing twelve month figures compact with the multiple to 1 decimal', () => {
    render();

    expect(figure('Revenue')).toBe('$1M');
    expect(figure('SDE')).toBe('$700K');
    expect(figure('Asking multiple (SDE)')).toBe('2.9x');
    expect(figure('SDE margin')).toBe('70.0%');
  });

  it('shows the exact amount on hover of a compact figure', () => {
    render({ deal: { ...deal, asking_price: 2_450_000 } });

    expect(figure('Asking')).toBe('$2.45M');
    expect(
      value('Asking').querySelector('[title]')!.getAttribute('title'),
    ).toBe('$2,450,000');
  });

  it('marks a missing multiple and margin as not available since they are calculated', () => {
    render({ deal: { ...deal, asking_price: null, revenue_ttm: null } });

    const hover = (label: string) =>
      value(label).querySelector('[aria-label]')!.getAttribute('aria-label');
    expect(hover('Asking')).toBe('Not disclosed');
    expect(hover('Asking multiple (SDE)')).toBe('Not available');
    expect(hover('SDE margin')).toBe('Not available');
  });

  it('follows the EBITDA basis across the earnings figures', () => {
    render({ deal: { ...deal, earnings_basis: 'ebitda' } });

    expect(figure('EBITDA')).toBe('$500K');
    expect(figure('Asking multiple (EBITDA)')).toBe('4.0x');
    expect(figure('EBITDA margin')).toBe('50.0%');
  });

  it('prefers adopted financials over trailing twelve months', () => {
    render({
      financials: {
        adopted_revenue: 2_000_000,
        adopted_sde: 600_000,
        adopted_ebitda: 450_000,
      },
    });

    expect(figure('Revenue')).toBe('$2M');
    expect(figure('SDE')).toBe('$600K');
    expect(figure('Asking multiple (SDE)')).toBe('3.3x');
  });

  it('shows only adopted figures once financials are adopted, never filling gaps from trailing twelve months', () => {
    render({
      financials: {
        adopted_revenue: 2_000_000,
        adopted_sde: null,
        adopted_ebitda: 450_000,
      },
    });

    expect(figure('Revenue')).toBe('$2M');
    expect(figure('SDE')).toBe('–');
    expect(
      value('SDE').querySelector('[aria-label]')!.getAttribute('aria-label'),
    ).toBe('Not disclosed');
    expect(figure('Asking multiple (SDE)')).toBe('–');
  });

  it('disables manager controls for a non-manager and says why', () => {
    render({ canManage: false });

    expect(container.textContent).toContain(MANAGERS_ONLY);
    expect(
      container.querySelector('[role="combobox"]')!.matches(':disabled'),
    ).toBe(true);

    openMenu();

    for (const label of [
      'Listing status',
      'Earnings basis',
      'Re-extract with AI',
      'Mark won',
      'Mark lost',
      'Archive',
    ]) {
      expect(menuItem(label).getAttribute('aria-disabled')).toBe('true');
    }
    expect(menuItem('Star').hasAttribute('aria-disabled')).toBe(false);
  });

  it('tells a non-manager a greyed-out menu action is for managers only when it takes focus', () => {
    render({ canManage: false });
    openMenu();

    act(() => menuItem('Mark won').focus());

    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
      'Managers only',
    );
  });

  it('does nothing when a non-manager picks a greyed-out menu action', () => {
    render({ canManage: false });
    openMenu();

    act(() => menuItem('Re-extract with AI').click());

    expect(dialog()).toBeNull();
  });

  it('opens the re-extract dialog from the overflow menu', () => {
    render();

    openMenu();
    act(() => menuItem('Re-extract with AI').click());

    expect(dialog()!.textContent).toContain('Re-extract this deal');
  });

  it.each([
    ['pulled', 'Pulled'],
    ['sold', 'Sold'],
  ])('marks a %s listing beside the stage', (listing_status, label) => {
    render({ deal: { ...deal, listing_status } });

    expect(container.textContent).toContain(label);
  });

  it('shows no listing mark while the listing is active', () => {
    render();

    expect(container.textContent).not.toMatch(/active|pulled|sold/i);
  });

  it('leaves manager controls enabled for a manager', () => {
    render({ canManage: true });

    expect(container.textContent).not.toContain(MANAGERS_ONLY);
    openMenu();
    expect(menuItem('Mark won').hasAttribute('aria-disabled')).toBe(false);
    expect(menuItem('Archive').hasAttribute('aria-disabled')).toBe(false);
  });

  it('shows the code name as a badge beside the business name', () => {
    render({ deal: { ...deal, code_name: 'Project Cedar' } });

    expect(container.querySelector('h1')!.textContent).toBe(
      'Brennan Climate Services',
    );
    expect(container.textContent).toContain('Project Cedar');
  });

  it('asks a manager to confirm a guessed business name in the profile editor', () => {
    render({
      deal: { ...deal, firm: { ...deal.firm, name_confirmed: false } },
    });

    act(() => button('Confirm business name').click());

    const editor = dialog()!;
    expect(editor.textContent).toContain('Deal profile');
    expect(
      editor.querySelector<HTMLInputElement>('#profile-business-name')!.value,
    ).toBe('Brennan Climate Services');
  });

  it('does not ask to confirm a confirmed business name', () => {
    render();

    expect(container.textContent).not.toContain('Confirm business name');
  });

  it('shows a non-manager the profile read-only with the reason', () => {
    render({ canManage: false });

    act(() => button('Deal profile').click());

    const editor = dialog()!;
    expect(editor.textContent).toContain(
      'Only deal managers can edit the deal profile.',
    );
    expect(
      editor
        .querySelector<HTMLInputElement>('#profile-business-name')!
        .matches(':disabled'),
    ).toBe(true);
  });
});
