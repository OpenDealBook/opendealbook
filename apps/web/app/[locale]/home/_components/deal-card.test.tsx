// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DealListItem } from '@odb/deals';

vi.mock('@odb/deals/server', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({}) }));

import { DealCard } from './deal-card';

const NAME = 'Brennan Climate Services of Greater Tampa Bay';

function deal(overrides: Partial<DealListItem> = {}): DealListItem {
  return {
    id: 'd-1',
    title: NAME,
    isExample: false,
    nextMilestone: { kind: 'closing', label: null, targetOn: '2026-12-15' },
    openItems: 4,
    overdueItems: 2,
    lastActivityAt: '2026-10-14T16:30:00Z',
    stage: 'nda_signed',
    stageLabel: 'NDA Signed',
    stageSortOrder: 3,
    resolution: null,
    resolutionReason: null,
    listingStatus: 'active',
    askingPrice: null,
    yourOffer: null,
    revenue: null,
    sde: null,
    multiple: null,
    margin: null,
    industryId: null,
    industryName: null,
    locationId: null,
    locationName: null,
    ownerUserId: 'u-1',
    starred: false,
    group: 'actively_pursuing',
    archivedAt: null,
    daysInStage: null,
    createdAt: null,
    updatedAt: null,
    captureMethod: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(
  item: DealListItem,
  ownerName: string | null,
  isOwner = false,
  locale = 'en-US',
) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale={locale}>
        <DealCard
          deal={item}
          ownerName={ownerName}
          isOwner={isOwner}
          detailBasePath={'/home/t/deals'}
        />
      </NextIntlClientProvider>,
    );
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DealCard', () => {
  it('shows its figures in the shared ledger format', async () => {
    await render(
      deal({
        askingPrice: 1_250_000,
        revenue: -40_000,
        multiple: 3.2,
        margin: 0.234,
      }),
      'Morgan Reyes',
    );

    const text = container.textContent;

    expect(text).toContain('$1.25M');
    expect(text).toContain('($40K)');
    expect(text).toContain('3.2x');
    expect(text).toContain('23.4%');
    expect(
      container.querySelector('[aria-label="Not disclosed"]')!.textContent,
    ).toBe('–');
  });

  it('shows the full business name without truncating it or a placeholder icon', async () => {
    await render(deal(), 'Morgan Reyes');

    const title = [...container.querySelectorAll('a')].find(
      (link) => link.textContent === NAME,
    );

    expect(title).toBeDefined();
    expect(title!.className).not.toContain('truncate');
    expect(container.textContent).not.toContain('#');
  });

  it('shows the next step, owner, open and overdue counts, and last activity', async () => {
    await render(deal(), 'Morgan Reyes');

    const text = container.textContent;

    expect(text).toContain('Closing, Dec 15, 2026');
    expect(text).toContain('Morgan Reyes');
    expect(text).toContain('4 open, 2 overdue');
    expect(text).toContain('Oct 14, 2026');
  });

  it('writes dates in the viewer locale', async () => {
    await render(deal(), 'Morgan Reyes', false, 'en-GB');

    expect(container.textContent).toContain('14 Oct 2026');
  });

  it('shows the stage as a stage chip with a matching strip, muted red once lost', async () => {
    await render(deal({ stage: 'due_diligence' }), 'Morgan Reyes');

    expect(
      container.querySelector('[data-slot="stage-chip"]')!.className,
    ).toContain('bg-stage-diligence');
    expect(container.querySelector('div[aria-hidden]')!.className).toContain(
      'bg-stage-diligence-foreground',
    );

    await render(
      deal({ stage: 'due_diligence', resolution: 'lost' }),
      'Morgan Reyes',
    );

    expect(
      container.querySelector('[data-slot="stage-chip"]')!.className,
    ).toContain('bg-stage-lost');
    expect(container.querySelector('div[aria-hidden]')!.className).toContain(
      'bg-stage-lost-foreground',
    );
  });

  it('mutes an archived deal, tags it Archived and mutes its stage chip', async () => {
    await render(
      deal({ stage: 'due_diligence', archivedAt: '2026-10-01T00:00:00Z' }),
      'Morgan Reyes',
    );

    const card = container.querySelector('[data-slot="card"]')!;
    const chip = container.querySelector('[data-slot="stage-chip"]')!;

    expect(card.className).toContain('bg-muted/40');
    expect(card.className).not.toContain('opacity');
    expect(card.textContent).toContain('Archived');
    expect(chip.textContent).toBe('NDA Signed');
    expect(chip.className).toContain('bg-muted text-muted-foreground');
    expect(chip.className).not.toContain('bg-stage-');
  });

  it('leaves a live deal undimmed and untagged', async () => {
    await render(deal(), 'Morgan Reyes');

    expect(
      container.querySelector('[data-slot="card"]')!.className,
    ).not.toContain('bg-muted/40');
    expect(container.textContent).not.toContain('Archived');
  });

  it('shows a dash for a missing multiple and margin, as not available', async () => {
    await render(deal(), 'Morgan Reyes');

    const missing = [
      ...container.querySelectorAll(
        '[data-slot="badge"] [title="Not available"]',
      ),
    ].map((dash) => dash.closest('[data-slot="badge"]')!.textContent);

    expect(missing).toEqual(['–', '– margin']);
  });

  it('shows a dash for missing days in stage, as not available', async () => {
    await render(deal(), 'Morgan Reyes');

    const dash = [
      ...container.querySelectorAll('[title="Not available"]'),
    ].find((each) => !each.closest('[data-slot="badge"]'))!;

    expect(dash.parentElement!.textContent).toBe('– days in stage');
  });

  it('names a custom milestone by its label', async () => {
    await render(
      deal({
        nextMilestone: {
          kind: 'custom',
          label: 'Site visit',
          targetOn: '2026-11-02',
        },
      }),
      'Morgan Reyes',
    );

    expect(container.textContent).toContain('Site visit, Nov 2, 2026');
  });

  it('lets the team owner delete an archived deal by typing its business name', async () => {
    await render(
      deal({ archivedAt: '2026-10-01T00:00:00Z' }),
      'Morgan Reyes',
      true,
    );

    const trigger = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Actions',
    )!;
    act(() => {
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    const remove = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent === 'Delete') as HTMLElement;
    act(() => remove.click());

    expect(document.body.textContent).toContain(`Type ${NAME} to confirm.`);
  });
});
