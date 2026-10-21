import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const upsert = vi.hoisted(() => vi.fn());

vi.mock('@odb/next/actions', () => ({
  enhanceAction: (fn: unknown) => fn,
}));
vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => ({
      upsert: (row: unknown) => {
        upsert(table, row);
        return { throwOnError: async () => ({}) };
      },
    }),
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

const { DealCalcDefaultsForm } =
  await import('./_components/deal-calc-defaults-form');
const { saveDealCalcDefaultsAction } = await import('./actions');

const teamPaths = {
  worst: {
    revenue_loss: 0.2,
    growth: -0.02,
    margin_change: -0.03,
    rate_shift: 0.03,
  },
  great: {
    revenue_loss: 0,
    growth: 0.08,
    margin_change: 0.01,
    rate_shift: -0.02,
  },
};

describe('team deal calc defaults', () => {
  it('saves the team default for what happens after standby', async () => {
    await (
      saveDealCalcDefaultsAction as unknown as (input: unknown) => Promise<void>
    )({
      accountId: 'acc-1',
      after_standby: 'remaining_term',
      year_basis: 'fiscal_year',
      scenario_paths: teamPaths,
      minimum_dscr: 1.4,
    });

    expect(upsert).toHaveBeenCalledWith('deal_calc_defaults', {
      account_id: 'acc-1',
      after_standby: 'remaining_term',
      year_basis: 'fiscal_year',
      scenario_paths: teamPaths,
      minimum_dscr: 1.4,
    });
  });

  function render(canManage: boolean) {
    return renderToStaticMarkup(
      <DealCalcDefaultsForm
        accountId={'acc-1'}
        defaults={{
          afterStandby: 'remaining_term',
          yearBasis: 'fiscal_year',
          scenarioPaths: teamPaths,
          minimumDscr: 1.4,
        }}
        canManage={canManage}
      />,
    );
  }

  it('shows the saved team defaults', () => {
    const html = render(true);

    expect(html).toContain('Remaining term');
    expect(html).not.toContain('Full term after standby');
    expect(html).toContain('Fiscal year');
    expect(html).not.toContain('Months from close');
    expect(html).toMatch(/Minimum DSCR.*value="1.4"/);
    expect(html).toMatch(/Worst path.*Revenue lost at close \(%\).*value="20"/);
    expect(html).toMatch(/Great path.*Annual growth \(%\).*value="8"/);
    expect(html).not.toContain('disabled=""');
  });

  it('locks every field for members, with the reason', () => {
    const html = render(false);

    expect(html).toContain(
      'Only team owners and admins can change the deal calc defaults.',
    );
    expect(html).toMatch(
      /<fieldset disabled=""[^]*Minimum DSCR[^]*Great path[^]*>Save</,
    );
  });
});
