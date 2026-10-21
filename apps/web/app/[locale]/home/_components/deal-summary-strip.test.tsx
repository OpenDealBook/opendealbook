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
        asking={2_000_000}
        adoptedSde={800_000}
        deadline={{ label: 'LOI deadline', on: '2026-11-03' }}
        waitingOnUs={3}
        {...props}
      />,
    ),
  );
}

function figure(label: string) {
  const term = [...container.querySelectorAll('dt')].find(
    (dt) => dt.textContent === label,
  );

  return term?.nextElementSibling?.textContent;
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
    expect(figure('Asking')).toBe('$2,000,000');
    expect(figure('Adopted SDE')).toBe('$800,000');
    expect(figure('Asking multiple (SDE)')).toBe('2.50x');
    expect(figure('Next deadline')).toBe('LOI deadline, Nov 3, 2026');
    expect(figure('Waiting on us')).toBe('3');
  });

  it('shows Not disclosed for asking and multiple when asking is null', () => {
    render({ asking: null });

    expect(figure('Asking')).toBe('Not disclosed');
    expect(figure('Asking multiple (SDE)')).toBe('Not disclosed');
  });

  it('shows Not disclosed for SDE and multiple when nothing is adopted', () => {
    render({ adoptedSde: null });

    expect(figure('Adopted SDE')).toBe('Not disclosed');
    expect(figure('Asking multiple (SDE)')).toBe('Not disclosed');
  });

  it('shows Not set when no deadline is open', () => {
    render({ deadline: null });

    expect(figure('Next deadline')).toBe('Not set');
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
