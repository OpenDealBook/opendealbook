// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdoptedFinancials } from './adopted-financials-card';
import {
  button,
  buttons,
  clearScreen,
  fakeServer,
  pageText,
  press,
  settle,
  show,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/next/actions/refusable-action', () => ({}));
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions('adoptCalcVersion'),
);

const DEAL_ID = 'd0000000-0000-4000-8000-000000000001';
const PRIMARY_ID = '7a1e0c55-3b9d-4f21-8c6e-1d2f3a4b5c6d';

const adoption = {
  dealId: DEAL_ID,
  adoptedAt: '2026-10-14T15:00:00Z',
  figures: { revenue: 3_400_000, sde: 780_000, ebitda: null, years: null },
};

const firstDeal = {
  id: 'c-1',
  name: null,
  type: 'deal',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  outputs_snapshot: { dscr: 1 },
};
const secondDeal = {
  ...firstDeal,
  id: 'c-2',
  created_at: '2026-10-02T00:00:00Z',
  updated_at: new Date(2026, 9, 20, 15, 14).toISOString(),
};
const VERSIONS = [secondDeal, firstDeal];

function text(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

describe('AdoptedFinancials', () => {
  it('names the calc the numbers came from and who adopted them when', () => {
    const html = renderToStaticMarkup(
      <AdoptedFinancials
        adoption={adoption}
        calc={{ ...secondDeal, name: 'Normalized 2025 SDE' }}
        versions={VERSIONS}
        adoptedBy={'Morgan Lee'}
        primaryChanged={null}
      />,
    );

    expect(text(html)).toContain(
      'From Normalized 2025 SDE, adopted by Morgan Lee on 10/14/2026',
    );
    expect(text(html)).toContain('$780,000');
    expect(text(html)).not.toContain('Primary calc changed since adoption');
  });

  it('calls an unnamed calc by its kind, number and saved time', () => {
    show(
      <AdoptedFinancials
        adoption={adoption}
        calc={secondDeal}
        versions={VERSIONS}
        adoptedBy={'Morgan Lee'}
        primaryChanged={null}
      />,
    );

    expect(pageText()).toContain(
      'From Deal v2, saved Oct 20 3:14 PM, adopted by Morgan Lee',
    );
  });

  it('says nothing is adopted when there are no financials', () => {
    const html = renderToStaticMarkup(
      <AdoptedFinancials
        adoption={null}
        calc={null}
        versions={[]}
        adoptedBy={null}
        primaryChanged={null}
      />,
    );

    expect(text(html)).toContain('No financials adopted yet');
  });

  it('lets a manager re-adopt the primary calc when it changed since adoption', async () => {
    show(
      <AdoptedFinancials
        adoption={adoption}
        calc={secondDeal}
        versions={VERSIONS}
        adoptedBy={'Morgan Lee'}
        primaryChanged={{
          primaryCalcVersionId: PRIMARY_ID,
          canReadopt: true,
          askWhom: 'Morgan Lee',
        }}
      />,
    );

    expect(pageText()).toContain('Primary calc changed since adoption');
    expect(pageText()).not.toContain('Only deal managers can re-adopt');

    await press('Re-adopt');
    await settle();

    expect(fakeServer.inputsTo('adoptCalcVersion')).toEqual([
      { deal_id: DEAL_ID, calc_version_id: PRIMARY_ID },
    ]);
  });

  it('shows anyone else the flag with a locked re-adopt and who to ask', () => {
    show(
      <AdoptedFinancials
        adoption={adoption}
        calc={secondDeal}
        versions={VERSIONS}
        adoptedBy={'Morgan Lee'}
        primaryChanged={{
          primaryCalcVersionId: PRIMARY_ID,
          canReadopt: false,
          askWhom: 'Morgan Lee',
        }}
      />,
    );

    expect(pageText()).toContain('Primary calc changed since adoption');
    expect(pageText()).toContain(
      'Only deal managers can re-adopt. Ask Morgan Lee.',
    );
    expect(button('Re-adopt').matches(':disabled')).toBe(true);
  });

  it('offers no re-adopt when the primary calc has not changed', () => {
    show(
      <AdoptedFinancials
        adoption={adoption}
        calc={secondDeal}
        versions={VERSIONS}
        adoptedBy={'Morgan Lee'}
        primaryChanged={null}
      />,
    );

    expect(buttons('Re-adopt')).toEqual([]);
  });
});
