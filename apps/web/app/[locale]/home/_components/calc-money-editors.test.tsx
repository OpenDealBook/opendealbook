import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('@odb/deals/server', () => ({
  saveSdeCalc: vi.fn(),
  saveWorkingCapitalCalc: vi.fn(),
}));

const NO_SOURCES = {
  calcVersionId: 'calc-1',
  dealId: 'deal-1',
  canEdit: false,
  citations: [],
  documents: [],
};

import { CalcSdeEditor } from './calc-sde-editor';
import { emptySdePeriodDraft } from './calc-shared';
import { CalcWorkingCapitalEditor } from './calc-working-capital-editor';

describe('money inputs in the SDE and working capital editors', () => {
  it('shows SDE line amounts with a dollar sign and thousands separators', () => {
    const html = renderToStaticMarkup(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initialPeriods={[
          {
            ...emptySdePeriodDraft('1'),
            amounts: { sales: '2400000' },
            custom: [{ id: 'c1', label: 'Rent', amount: '36000' }],
          },
        ]}
      />,
    );

    expect(html).toMatch(
      /\$<\/span><input[^>]*aria-label="Sales, period 1"[^>]*value="2,400,000"/,
    );
    expect(html).toMatch(/\$<\/span><input[^>]*value="36,000"/);
  });

  it('shows working capital amounts as dollars, each labelled', () => {
    const html = renderToStaticMarkup(
      <CalcWorkingCapitalEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initial={{
          current_assets: '450000',
          current_liabilities: '120000',
          avg_monthly_revenue: '200000',
        }}
      />,
    );
    const id = /<label[^>]*for="([^"]+)"[^>]*>Current assets<\/label>/.exec(
      html,
    )?.[1];

    expect(id).toBeDefined();
    expect(html).toMatch(
      new RegExp(`\\$</span><input[^>]*id="${id}"[^>]*value="450,000"`),
    );
  });
});

describe('SDE periods wider than the window', () => {
  it('pins the line labels to the left while the periods scroll inside the table', () => {
    const html = renderToStaticMarkup(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initialPeriods={['0.4', '0.3', '0.2', '0.1'].map((weight) => ({
          ...emptySdePeriodDraft(weight),
          amounts: { sales: '2400000' },
        }))}
      />,
    );
    const firstCells = [...html.matchAll(/<tr[^>]*>\s*<(td|th)([^>]*)>/g)].map(
      (match) => match[2],
    );

    expect(firstCells.length).toBeGreaterThan(20);
    for (const attributes of firstCells) {
      expect(attributes).toMatch(/class="[^"]*\bsticky\b[^"]*\bleft-0\b/);
    }
  });

  it('pins the period headers to the top while the rows scroll inside the table', () => {
    const html = renderToStaticMarkup(
      <CalcSdeEditor
        calcVersionId={'calc-1'}
        sources={NO_SOURCES}
        initialPeriods={['0.5', '0.5'].map((weight) =>
          emptySdePeriodDraft(weight),
        )}
      />,
    );
    const headerCells = [
      ...(/<thead[^>]*>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? '').matchAll(
        /<th([^>]*)>/g,
      ),
    ].map((match) => match[1]);

    expect(headerCells).toHaveLength(3);
    for (const attributes of headerCells) {
      expect(attributes).toMatch(/class="[^"]*\bsticky\b/);
      expect(attributes).toMatch(/class="[^"]*\btop-0\b/);
    }
    expect(headerCells[0]).toMatch(/class="[^"]*\bleft-0\b/);
  });
});
