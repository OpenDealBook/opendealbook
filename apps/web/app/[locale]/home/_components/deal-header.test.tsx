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

function dialog() {
  return document.querySelector('[role="dialog"]');
}

function figure(label: string) {
  return [...container.querySelectorAll('dt')].find(
    (candidate) => candidate.textContent === label,
  )!.nextElementSibling!.textContent;
}

beforeEach(() => {
  pathname = `/home/harbor/deals/${deal.id}/financials`;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DealHeader', () => {
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

  it('shows the listing status once, in sentence case', () => {
    render();

    expect(container.textContent!.split('Active')).toHaveLength(2);
    expect(container.textContent).not.toContain('active');
  });

  it('keeps only the title row and the tabs pinned while the rest scrolls away', () => {
    render({ tabs: <nav>Deal tabs</nav> });

    const pinned = [...container.querySelectorAll('*')].filter((element) =>
      /(^|\s)([a-z0-9]+:)*sticky(\s|$)/.test(element.className),
    );
    const pinnedText = pinned.map((element) => element.textContent).join('|');

    expect(pinnedText).toContain('Brennan Climate Services');
    expect(pinnedText).toContain('Deal tabs');
    for (const scrolling of ['Revenue', 'Star', 'Deal profile', 'Mark won']) {
      expect(pinnedText).not.toContain(scrolling);
    }
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

    expect(figure('Asking')).toBe('$2,000,000');
    expect(figure('Asking multiple (SDE)')).toBe('2.86x');
  });

  it('shows trailing twelve month figures with the multiple to 2 decimals', () => {
    render();

    expect(figure('Revenue')).toBe('$1,000,000');
    expect(figure('SDE')).toBe('$700,000');
    expect(figure('Asking multiple (SDE)')).toBe('2.86x');
  });

  it('prefers adopted financials over trailing twelve months', () => {
    render({
      financials: {
        adopted_revenue: 2_000_000,
        adopted_sde: 600_000,
        adopted_ebitda: 450_000,
      },
    });

    expect(figure('Revenue')).toBe('$2,000,000');
    expect(figure('SDE')).toBe('$600,000');
    expect(figure('Asking multiple (SDE)')).toBe('3.33x');
  });

  it('shows only adopted figures once financials are adopted, never filling gaps from trailing twelve months', () => {
    render({
      financials: {
        adopted_revenue: 2_000_000,
        adopted_sde: null,
        adopted_ebitda: 450_000,
      },
    });

    expect(figure('Revenue')).toBe('$2,000,000');
    expect(figure('SDE')).toBe('Not disclosed');
    expect(figure('Asking multiple (SDE)')).toBe('Not disclosed');
  });

  it('disables manager controls for a non-manager and says why', () => {
    render({ canManage: false });

    expect(container.textContent).toContain(MANAGERS_ONLY);
    for (const label of [
      'Mark won',
      'Mark lost',
      'Archive',
      'Re-extract with AI',
    ]) {
      expect(button(label).matches(':disabled')).toBe(true);
    }
    for (const trigger of container.querySelectorAll('[role="combobox"]')) {
      expect(trigger.matches(':disabled')).toBe(true);
    }
    expect(button('Star').matches(':disabled')).toBe(false);
  });

  it('leaves manager controls enabled for a manager', () => {
    render({ canManage: true });

    expect(container.textContent).not.toContain(MANAGERS_ONLY);
    expect(button('Mark won').matches(':disabled')).toBe(false);
    expect(button('Archive').matches(':disabled')).toBe(false);
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
