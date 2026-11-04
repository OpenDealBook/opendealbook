// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TimelineMilestone } from '@odb/deal-timeline/queries.ts';

import { DealSummaryStrip, nextDeadline } from './deal-summary-strip';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<ComponentProps<typeof DealSummaryStrip>>) {
  act(() =>
    root.render(
      <DealSummaryStrip
        stage={{ key: 'loi', label: 'LOI' }}
        lost={false}
        asking={2_000_000}
        basis={'sde'}
        adoptedSde={800_000}
        adoptedEbitda={500_000}
        deadline={{ label: 'LOI deadline', on: '2026-11-03' }}
        waitingOnUs={3}
        {...props}
      />,
    ),
  );
}

function value(label: string) {
  return [...container.querySelectorAll('dt')].find(
    (dt) => dt.textContent === label,
  )?.nextElementSibling;
}

function figure(label: string) {
  return value(label)?.textContent;
}

function milestone(overrides: Partial<TimelineMilestone>): TimelineMilestone {
  return {
    id: crypto.randomUUID(),
    kind: 'custom',
    label: 'Milestone',
    targetOn: null,
    actualOn: null,
    shared: false,
    ...overrides,
  };
}

describe('DealSummaryStrip', () => {
  it('shows stage, asking, adopted SDE and multiple, and next deadline', () => {
    render({});

    expect(figure('Stage')).toBe('LOI');
    expect(figure('Asking')).toBe('$2M');
    expect(figure('Adopted SDE')).toBe('$800K');
    expect(figure('Asking multiple (SDE)')).toBe('2.5x');
    expect(figure('Next deadline')).toBe('LOI deadline, Nov 3, 2026');
    expect(figure('Waiting on us')).toBe('3');
  });

  it('tones the stage chip as lost on a lost deal', () => {
    render({ lost: true });

    expect(
      container.querySelector('[data-slot="stage-chip"]')!.className,
    ).toContain('bg-stage-lost');
  });

  it('shows the exact amount on hover of a compact figure', () => {
    render({ asking: 2_450_000 });

    expect(figure('Asking')).toBe('$2.45M');
    expect(
      value('Asking')!.querySelector('[title]')!.getAttribute('title'),
    ).toBe('$2,450,000');
  });

  it('follows the EBITDA basis for the earnings figure and the multiple', () => {
    render({ basis: 'ebitda' });

    expect(figure('Adopted EBITDA')).toBe('$500K');
    expect(figure('Asking multiple (EBITDA)')).toBe('4.0x');
    expect(figure('Adopted SDE')).toBeUndefined();
  });

  it('shows a dash meaning not disclosed for asking and multiple when asking is null', () => {
    render({ asking: null });

    expect(figure('Asking')).toBe('–');
    expect(figure('Asking multiple (SDE)')).toBe('–');
    expect(
      value('Asking')!
        .querySelector('[aria-label]')!
        .getAttribute('aria-label'),
    ).toBe('Not disclosed');
    expect(
      value('Asking multiple (SDE)')!
        .querySelector('[aria-label]')!
        .getAttribute('aria-label'),
    ).toBe('Not available');
  });

  it('shows a dash for earnings and multiple when nothing is adopted on the basis', () => {
    render({ basis: 'ebitda', adoptedEbitda: null });

    expect(figure('Adopted EBITDA')).toBe('–');
    expect(figure('Asking multiple (EBITDA)')).toBe('–');
  });

  it('sets the deadline text smaller than the figures so long labels fit', () => {
    render({
      deadline: { label: 'Financing commitment deadline', on: '2026-11-03' },
    });

    expect(value('Next deadline')!.className).toContain('text-sm');
    expect(value('Next deadline')!.className).not.toContain('text-2xl');
    expect(value('Asking')!.className).toContain('text-2xl');
  });

  it('shows a dash meaning not set when no deadline is open', () => {
    render({ deadline: null });

    expect(figure('Next deadline')).toBe('–');
    expect(
      value('Next deadline')!.querySelector('[title]')!.getAttribute('title'),
    ).toBe('Not set');
  });
});

describe('nextDeadline', () => {
  it('picks the earliest open target across milestones and the must-close-by date', () => {
    const milestones = [
      milestone({ label: 'Closing', targetOn: '2026-12-15' }),
      milestone({
        label: 'LOI signed',
        targetOn: '2026-10-01',
        actualOn: '2026-10-02',
      }),
      milestone({ label: 'Diligence end', targetOn: '2026-11-20' }),
      milestone({ label: 'APA signing' }),
    ];

    expect(nextDeadline(milestones, '2026-12-01')).toEqual({
      label: 'Diligence end',
      on: '2026-11-20',
    });
    expect(nextDeadline(milestones, '2026-11-10')).toEqual({
      label: 'Must close by',
      on: '2026-11-10',
    });
  });

  it('is null when nothing has an open target', () => {
    expect(
      nextDeadline(
        [milestone({ targetOn: '2026-10-01', actualOn: '2026-10-01' })],
        null,
      ),
    ).toBeNull();
  });
});
