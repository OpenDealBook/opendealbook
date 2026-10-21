import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SharedTimeline } from './shared-timeline';

describe('SharedTimeline', () => {
  it('shows each milestone in the order given, named, with plain target and actual dates', () => {
    const html = renderToStaticMarkup(
      <SharedTimeline
        milestones={[
          {
            kind: 'loi_deadline',
            label: null,
            target_on: '2026-10-20',
            actual_on: '2026-10-01',
          },
          {
            kind: 'closing',
            label: null,
            target_on: '2026-12-01',
            actual_on: null,
          },
          {
            kind: 'custom',
            label: 'Landlord consent',
            target_on: null,
            actual_on: null,
          },
        ]}
      />,
    );

    expect(html).toContain('Timeline');
    expect(html.indexOf('LOI deadline')).toBeLessThan(html.indexOf('Closing'));
    expect(html.indexOf('Closing')).toBeLessThan(
      html.indexOf('Landlord consent'),
    );
    expect(html).toContain('Oct 20, 2026');
    expect(html).toContain('Oct 1, 2026');
    expect(html).toContain('Dec 1, 2026');
    expect(html).toContain('Not set');
  });

  it('shows an effective date with no target as same as closing when closing is shown', () => {
    const html = renderToStaticMarkup(
      <SharedTimeline
        milestones={[
          { kind: 'closing', label: null, target_on: null, actual_on: null },
          { kind: 'effective', label: null, target_on: null, actual_on: null },
        ]}
      />,
    );

    expect(html).toMatch(/Effective date<\/td><td[^>]*>Same as closing<\/td><td[^>]*>Not set</);
  });

  it('shows an effective date with no target as not set when closing is not shown', () => {
    const html = renderToStaticMarkup(
      <SharedTimeline
        milestones={[
          { kind: 'effective', label: null, target_on: null, actual_on: null },
        ]}
      />,
    );

    expect(html).not.toContain('Same as closing');
  });

  it('shows nothing when no milestone is shared', () => {
    expect(renderToStaticMarkup(<SharedTimeline milestones={[]} />)).toBe('');
  });
});
