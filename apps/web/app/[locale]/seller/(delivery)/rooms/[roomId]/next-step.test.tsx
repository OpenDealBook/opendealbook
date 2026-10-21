import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NextStep } from './next-step';

describe('NextStep', () => {
  it('lists unanswered questions and deadlines still to meet', () => {
    const html = renderToStaticMarkup(
      <NextStep
        questions={[{ id: 'q-1', title: 'Customer list?' }]}
        deadlines={[{ label: 'Closing', targetOn: '2026-11-03' }]}
        items={[]}
        today={'2026-10-19'}
      />,
    );

    expect(html).toContain('Next step');
    expect(html).toContain('Answer: Customer list?');
    expect(html).toContain('Closing by Nov 3, 2026');
    expect(html).not.toContain('Nothing needed from you today');
  });

  it('shows overdue deadlines first, labelled Overdue', () => {
    const html = renderToStaticMarkup(
      <NextStep
        questions={[{ id: 'q-1', title: 'Customer list?' }]}
        deadlines={[
          { label: 'Closing', targetOn: '2026-11-03' },
          { label: 'Financing', targetOn: '2026-10-18' },
        ]}
        items={[]}
        today={'2026-10-19'}
      />,
    );
    const steps = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) =>
      match[1]!.replace(/<[^>]+>/g, ''),
    );

    expect(steps).toEqual([
      'Overdue: Financing by Oct 18, 2026',
      'Answer: Customer list?',
      'Closing by Nov 3, 2026',
    ]);
  });

  it('lists checklist items waiting on the seller, with their due date when set', () => {
    const html = renderToStaticMarkup(
      <NextStep
        questions={[]}
        deadlines={[]}
        items={[
          { title: 'Send the lease', due_at: '2026-11-01T00:00:00+00:00' },
          { title: 'Sign the NDA', due_at: null },
        ]}
        today={'2026-10-19'}
      />,
    );
    const steps = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) =>
      match[1]!.replace(/<[^>]+>/g, ''),
    );

    expect(steps).toEqual(['Send the lease by Nov 1, 2026', 'Sign the NDA']);
  });

  it('puts checklist items past their due date at the top, labelled Overdue', () => {
    const html = renderToStaticMarkup(
      <NextStep
        questions={[{ id: 'q-1', title: 'Customer list?' }]}
        deadlines={[]}
        items={[
          { title: 'Send the lease', due_at: '2026-11-01T00:00:00+00:00' },
          { title: 'Send the tax returns', due_at: '2026-10-10T00:00:00+00:00' },
        ]}
        today={'2026-10-19'}
      />,
    );
    const steps = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) =>
      match[1]!.replace(/<[^>]+>/g, ''),
    );

    expect(steps).toEqual([
      'Overdue: Send the tax returns by Oct 10, 2026',
      'Answer: Customer list?',
      'Send the lease by Nov 1, 2026',
    ]);
  });

  it('says nothing is needed when nothing waits on the seller', () => {
    const html = renderToStaticMarkup(
      <NextStep questions={[]} deadlines={[]} items={[]}
        today={'2026-10-19'} />,
    );

    expect(html).toContain('Next step');
    expect(html).toContain('Nothing needed from you today');
  });
});
