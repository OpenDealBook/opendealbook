import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdoptedYears } from './adopted-years';

function row(html: string, label: string): string {
  const start = html.indexOf(`>${label}</td>`);
  return html.slice(start, html.indexOf('</tr>', start));
}

describe('AdoptedYears', () => {
  it('shows the adopted debt service, DSCR and net cash flow for years 1 to 3', () => {
    const html = renderToStaticMarkup(
      <AdoptedYears
        years={[
          { year: 1, debt_service: 36_000, dscr: 100_000 / 36_000, net_cash_flow: 64_000 },
          { year: 2, debt_service: 53_142.857, dscr: 2.0699, net_cash_flow: 56_857.143 },
          { year: 3, debt_service: 0, dscr: null, net_cash_flow: 121_000 },
        ]}
      />,
    );

    expect(row(html, 'Debt service')).toMatch(/\$36,000.*\$53,143.*\$0/);
    expect(row(html, 'DSCR')).toMatch(/2\.78x.*2\.07x.*n\/a/);
    expect(row(html, 'Net cash flow')).toMatch(/\$64,000.*\$56,857.*\$121,000/);
  });
});
