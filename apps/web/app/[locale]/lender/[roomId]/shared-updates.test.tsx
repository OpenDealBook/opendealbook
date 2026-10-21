import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SharedUpdates } from './shared-updates';

describe('SharedUpdates', () => {
  it('shows each update in the order given with its subject, body and sent date', () => {
    const html = renderToStaticMarkup(
      <SharedUpdates
        updates={[
          {
            subject: 'Appraisal in',
            body: 'The appraisal came back at value.',
            sent_at: '2026-10-06T10:00:00+00:00',
          },
          {
            subject: 'Closing slips',
            body: 'We now close on December 12.',
            sent_at: '2026-10-02T10:00:00+00:00',
          },
        ]}
      />,
    );

    expect(html).toContain('Updates');
    expect(html.indexOf('Appraisal in')).toBeLessThan(
      html.indexOf('Closing slips'),
    );
    expect(html).toContain('The appraisal came back at value.');
    expect(html).toContain('We now close on December 12.');
    expect(html).toContain('Oct 6, 2026, 10:00 AM UTC');
    expect(html).toContain('Oct 2, 2026, 10:00 AM UTC');
  });

  it('shows nothing when no update was sent to the reader', () => {
    expect(renderToStaticMarkup(<SharedUpdates updates={[]} />)).toBe('');
  });
});
