// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FigureValue } from '@odb/ui/figure-value';
import {
  formatDate,
  formatMoney,
  formatMoneyExact,
  formatMultiple,
  formatPercent,
  formatMonth,
  formatMonths,
  formatRatio,
  formatRatioGap,
  formatTimestamp,
} from '@odb/ui/format';
import { TableCell } from '@odb/ui/table';

function rendered(markup: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.firstElementChild as HTMLElement;
}

describe('formatMoney', () => {
  it.each([
    [1_250_000, '$1.25M'],
    [1_200_000, '$1.2M'],
    [850_000, '$850K'],
    [12_345, '$12.35K'],
    [2_500_000_000, '$2.5B'],
    [640, '$640'],
  ])('shows %d as %s', (value, text) => {
    expect(formatMoney(value)).toBe(text);
  });

  it('wraps negative amounts in parentheses', () => {
    expect(formatMoney(-1_200_000)).toBe('($1.2M)');
  });
});

describe('formatMoneyExact', () => {
  it('shows whole dollars with grouping', () => {
    expect(formatMoneyExact(1_250_000)).toBe('$1,250,000');
  });

  it('wraps negative amounts in parentheses', () => {
    expect(formatMoneyExact(-1_250_000)).toBe('($1,250,000)');
  });
});

describe('formatMultiple', () => {
  it.each([
    [3.24, '3.2x'],
    [3, '3.0x'],
  ])('shows %d as %s', (value, text) => {
    expect(formatMultiple(value)).toBe(text);
  });
});

describe('formatRatio', () => {
  it.each([
    [1.25, '1.25x'],
    [2, '2.00x'],
    [1.014, '1.01x'],
  ])('shows %d as %s', (value, text) => {
    expect(formatRatio(value)).toBe(text);
  });
});

describe('formatRatioGap', () => {
  it.each([
    [0.07, '+0.07x'],
    [0, '+0.00x'],
    [-0.07, '(0.07x)'],
  ])('shows a coverage gap of %d as %s', (value, text) => {
    expect(formatRatioGap(value)).toBe(text);
  });
});

describe('formatMonths', () => {
  it.each([
    [4.24, '4.2 mo'],
    [3, '3.0 mo'],
  ])('shows %d months as %s', (value, text) => {
    expect(formatMonths(value)).toBe(text);
  });
});

describe('formatPercent', () => {
  it.each([
    [0.125, '12.5%'],
    [0.6, '60.0%'],
    [-0.031, '-3.1%'],
  ])('shows the fraction %d as %s', (value, text) => {
    expect(formatPercent(value)).toBe(text);
  });
});

describe('formatDate', () => {
  it('reads as a short month, day and year in the given locale', () => {
    expect(formatDate('2026-11-02', 'en-US')).toBe('Nov 2, 2026');
  });

  it('keeps the calendar day of a date-only value', () => {
    expect(formatDate('2026-01-01', 'en-US')).toBe('Jan 1, 2026');
  });
});

describe('formatMonth', () => {
  it('reads a period month in the given locale', () => {
    expect(formatMonth('2026-11-01', 'en-US')).toBe('Nov 2026');
    expect(formatMonth('2026-11-01', 'de-DE')).toBe('Nov. 2026');
  });
});

describe('formatTimestamp', () => {
  it('reads the calendar day in the given time zone', () => {
    expect(
      formatTimestamp('2026-11-03T03:30:00Z', 'en-US', 'America/New_York'),
    ).toBe('Nov 2, 2026');
    expect(formatTimestamp('2026-11-03T03:30:00Z', 'en-US', 'UTC')).toBe(
      'Nov 3, 2026',
    );
  });
});

describe('FigureValue', () => {
  it('shows months of coverage with one decimal and no hover value', () => {
    const figure = rendered(
      renderToStaticMarkup(<FigureValue value={4.24} format={'months'} />),
    );

    expect([figure.textContent, figure.title]).toEqual(['4.2 mo', '']);
  });

  it('shows ratios with two decimals', () => {
    const figure = rendered(
      renderToStaticMarkup(<FigureValue value={1.25} format={'ratio'} />),
    );

    expect([figure.textContent, figure.title]).toEqual(['1.25x', '']);
  });

  it('explains a missing calculated value as not available', () => {
    const figure = rendered(
      renderToStaticMarkup(
        <FigureValue value={null} format={'ratio'} calculated />,
      ),
    );

    expect([figure.textContent, figure.title]).toEqual([
      '\u2013',
      'Not available',
    ]);
  });

  it('shows compact money with the exact amount on hover', () => {
    const figure = rendered(
      renderToStaticMarkup(<FigureValue value={1_250_000} format={'money'} />),
    );

    expect(figure.textContent).toBe('$1.25M');
    expect(figure.title).toBe('$1,250,000');
  });

  it('shows a missing value as a grey en dash explained on hover', () => {
    const figure = rendered(
      renderToStaticMarkup(<FigureValue value={null} format={'money'} />),
    );

    expect(figure.textContent).toBe('–');
    expect(figure.title).toBe('Not disclosed');
    expect(figure.className).toContain('text-muted-foreground');
  });

  it('takes the missing-value explanation as a prop', () => {
    const figure = rendered(
      renderToStaticMarkup(
        <FigureValue
          value={null}
          format={'multiple'}
          missingLabel={'Not set'}
        />,
      ),
    );

    expect(figure.title).toBe('Not set');
  });

  it('shows multiples and percents without a hover value', () => {
    const multiple = rendered(
      renderToStaticMarkup(<FigureValue value={3.24} format={'multiple'} />),
    );
    const percent = rendered(
      renderToStaticMarkup(<FigureValue value={0.125} format={'percent'} />),
    );

    expect([multiple.textContent, multiple.title]).toEqual(['3.2x', '']);
    expect([percent.textContent, percent.title]).toEqual(['12.5%', '']);
  });
});

describe('numeric TableCell', () => {
  it('right-aligns with tabular figures', () => {
    const cell = rendered(
      renderToStaticMarkup(
        <table>
          <tbody>
            <tr>
              <TableCell numeric>1</TableCell>
            </tr>
          </tbody>
        </table>,
      ),
    ).querySelector('td')!;

    expect(cell.className).toContain('text-right');
    expect(cell.className).toContain('tabular-nums');
  });
});
