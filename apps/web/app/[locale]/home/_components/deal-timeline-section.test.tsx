// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DealTimeline } from '@odb/deal-timeline/queries.ts';

const server = vi.hoisted(() => ({
  set: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  draft: vi.fn(),
}));

vi.mock('@odb/deal-timeline/actions.ts', () => ({
  setMilestone: server.set,
  removeMilestone: server.remove,
}));

vi.mock('@odb/deal-updates/actions.ts', () => ({
  draftTimelineUpdate: server.draft,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { DealTimelineSection } from './deal-timeline-section';

const dealId = 'd0000000-0000-4000-8000-000000000001';
const closingId = 'c0000000-0000-4000-8000-000000000001';
const loiId = 'c0000000-0000-4000-8000-000000000002';
const consentId = 'c0000000-0000-4000-8000-000000000003';
const exclusivityId = 'c0000000-0000-4000-8000-000000000004';
const lateExtensionId = 'c0000000-0000-4000-8000-000000000005';
const extensionId = 'c0000000-0000-4000-8000-000000000006';

const timeline: DealTimeline = {
  canManage: true,
  exclusivityOver: false,
  teamToday: '2026-10-15',
  lapsedExtensions: [lateExtensionId],
  milestones: [
    {
      id: loiId,
      kind: 'loi_deadline',
      label: 'LOI deadline',
      targetOn: '2026-10-10',
      actualOn: '2026-10-09',
      shared: false,
    },
    {
      id: exclusivityId,
      kind: 'exclusivity_end',
      label: 'Exclusivity ends',
      targetOn: '2026-10-14',
      actualOn: null,
      shared: true,
    },
    {
      id: null,
      kind: 'diligence_end',
      label: 'Diligence end',
      targetOn: null,
      actualOn: null,
      shared: false,
    },
    {
      id: null,
      kind: 'financing_contingency',
      label: 'Financing contingency',
      targetOn: null,
      actualOn: null,
      shared: false,
    },
    {
      id: null,
      kind: 'apa_signing',
      label: 'APA signing',
      targetOn: null,
      actualOn: null,
      shared: true,
    },
    {
      id: closingId,
      kind: 'closing',
      label: 'Closing',
      targetOn: '2026-12-15',
      actualOn: null,
      shared: true,
    },
    {
      id: null,
      kind: 'effective',
      label: 'Effective date',
      targetOn: null,
      actualOn: null,
      shared: true,
    },
    {
      id: lateExtensionId,
      kind: 'custom',
      label: 'LOI extension to Nov 30, 2026',
      targetOn: null,
      actualOn: '2026-10-15',
      shared: true,
    },
    {
      id: extensionId,
      kind: 'custom',
      label: 'LOI extension to Dec 31, 2026',
      targetOn: null,
      actualOn: '2026-10-15',
      shared: true,
    },
    {
      id: consentId,
      kind: 'custom',
      label: 'Landlord consent',
      targetOn: '2026-10-14',
      actualOn: null,
      shared: false,
    },
  ],
  history: [
    {
      id: 'e2',
      at: '2026-10-14T18:30:00.000Z',
      by: 'Ada Owner',
      milestone: 'LOI deadline',
      change: 'removed',
    },
    {
      id: 'e1',
      at: '2026-10-01T12:00:00.000Z',
      by: 'Ben Partner',
      milestone: 'Closing',
      change: 'set',
      targetOn: '2026-12-15',
      actualOn: null,
      shared: true,
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

function row(name: string) {
  return [...container.querySelectorAll('tbody tr')].find(
    (candidate) => candidate.querySelector('th')?.textContent === name,
  )!;
}

function button(within: Element, text: string) {
  return [...within.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text,
  )!;
}

function type(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function field(label: string) {
  const labelled = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )!;

  return container.querySelector<HTMLInputElement>(
    `#${CSS.escape(labelled.htmlFor)}`,
  )!;
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
}

beforeEach(() => {
  server.set.mockReset();
  server.remove.mockReset();
  server.refresh.mockReset();
  server.draft.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(<DealTimelineSection dealId={dealId} timeline={timeline} />),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('DealTimelineSection', () => {
  it('can be linked to as #timeline', () => {
    expect(container.querySelector('#timeline')!.textContent).toContain(
      'Timeline',
    );
  });

  it('shows each milestone with plain dates and sharing', () => {
    expect(row('Closing').textContent).toContain('Dec 15, 2026');
    expect(row('Closing').textContent).toContain('Shared');
    expect(row('LOI deadline').textContent).toContain('Oct 9, 2026');
    expect(row('LOI deadline').textContent).toContain('Team only');
    expect(row('Diligence end').textContent).toContain('Not set');
  });

  it('shows an effective date with no target as same as closing', () => {
    const [target, actual] = row('Effective date').querySelectorAll('td');

    expect(target!.textContent).toBe('Same as closing');
    expect(actual!.textContent).toBe('Not set');
  });

  it('flags a milestone overdue only when its target passed with no actual', () => {
    expect(row('Landlord consent').textContent).toContain('Overdue');
    expect(row('LOI deadline').textContent).not.toContain('Overdue');
    expect(row('Closing').textContent).not.toContain('Overdue');
  });

  it('flags a passed exclusivity end lapsed, not overdue, while exclusivity is not over', () => {
    expect(row('Exclusivity ends').textContent).toContain('Lapsed');
    expect(row('Exclusivity ends').textContent).not.toContain('Overdue');
    expect(row('Landlord consent').textContent).not.toContain('Lapsed');
  });

  it('does not flag exclusivity lapsed while its end is still today for the team', () => {
    act(() =>
      root.render(
        <DealTimelineSection
          dealId={dealId}
          timeline={{ ...timeline, teamToday: '2026-10-14' }}
        />,
      ),
    );

    expect(row('Exclusivity ends').textContent).not.toContain('Lapsed');
  });

  it('flags an extension agreed after the end it extended', () => {
    expect(row('LOI extension to Nov 30, 2026').textContent).toContain(
      'Lapsed',
    );
    expect(row('LOI extension to Dec 31, 2026').textContent).not.toContain(
      'Lapsed',
    );
  });

  it('drops the lapsed flag once exclusivity is over', () => {
    act(() =>
      root.render(
        <DealTimelineSection
          dealId={dealId}
          timeline={{ ...timeline, exclusivityOver: true }}
        />,
      ),
    );

    expect(row('Exclusivity ends').textContent).not.toContain('Lapsed');
    expect(row('Exclusivity ends').textContent).not.toContain('Overdue');
  });

  it('saves a new target, actual and sharing for a milestone', async () => {
    server.set.mockResolvedValueOnce({ ok: true, value: undefined });
    await click(button(row('Closing'), 'Edit'));
    type(field('Target'), '2026-12-20');
    type(field('Actual'), '2026-10-15');
    await click(container.querySelector<HTMLElement>('[role="checkbox"]')!);
    await click(button(container, 'Save'));

    expect(server.set).toHaveBeenCalledWith({
      dealId,
      milestoneId: closingId,
      kind: 'closing',
      targetOn: '2026-12-20',
      actualOn: '2026-10-15',
      shared: false,
    });
    expect(server.refresh).toHaveBeenCalled();
    expect(container.textContent).not.toContain('Save');
  });

  it('starts an unset fixed milestone with its default sharing and a new id', async () => {
    server.set.mockResolvedValueOnce({ ok: true, value: undefined });
    await click(button(row('APA signing'), 'Edit'));
    type(field('Target'), '2026-11-20');
    await click(button(container, 'Save'));

    expect(server.set).toHaveBeenCalledWith({
      dealId,
      milestoneId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: 'apa_signing',
      targetOn: '2026-11-20',
      actualOn: null,
      shared: true,
    });
  });

  it('adds a custom milestone by name', async () => {
    server.set.mockResolvedValueOnce({ ok: true, value: undefined });
    await click(button(container, 'Add milestone'));
    type(field('Name'), 'Licence transfer');
    type(field('Target'), '2026-11-01');
    await click(button(container, 'Save'));

    expect(server.set).toHaveBeenCalledWith({
      dealId,
      milestoneId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      kind: 'custom',
      label: 'Licence transfer',
      targetOn: '2026-11-01',
      actualOn: null,
      shared: false,
    });
  });

  it('removes a set milestone, fixed or custom', async () => {
    server.remove.mockResolvedValue({ ok: true, value: undefined });
    await click(button(row('LOI deadline'), 'Remove'));
    await click(button(row('Landlord consent'), 'Remove'));

    expect(server.remove.mock.calls).toEqual([
      [{ dealId, milestoneId: loiId }],
      [{ dealId, milestoneId: consentId }],
    ]);
    expect(server.refresh).toHaveBeenCalled();
    expect(row('Diligence end').textContent).not.toContain('Remove');
  });

  it('keeps the editor open and shows the refusal', async () => {
    server.set.mockResolvedValueOnce({
      ok: false,
      refusal: 'An actual date cannot be in the future.',
    });
    await click(button(row('Closing'), 'Edit'));
    type(field('Actual'), '2026-10-20');
    await click(button(container, 'Save'));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'An actual date cannot be in the future.',
    );
    expect(button(container, 'Save')).toBeDefined();
    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('lists the change history newest first with when it happened', () => {
    const entries = [...container.querySelectorAll('[data-timeline-change]')];

    expect(
      entries.map((entry) => entry.querySelector('span')?.textContent),
    ).toEqual([
      'LOI deadline removed',
      'Closing set: target Dec 15, 2026, no actual, shared',
    ]);
    expect(entries[0]!.querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-10-14T18:30:00.000Z',
    );
  });

  it('names who made each change', () => {
    const entries = [...container.querySelectorAll('[data-timeline-change]')];

    expect(entries[0]!.textContent).toContain('Ada Owner');
    expect(entries[1]!.textContent).toContain('Ben Partner');
  });

  it('shows a member without deals.manage the timeline read-only', () => {
    act(() =>
      root.render(
        <DealTimelineSection
          dealId={dealId}
          timeline={{ ...timeline, canManage: false }}
        />,
      ),
    );

    expect(row('Closing').textContent).toContain('Dec 15, 2026');
    expect(row('Landlord consent').textContent).toContain('Overdue');
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('[data-timeline-change]')).toHaveLength(
      2,
    );
  });

  describe('offering a drafted update after a shared date change', () => {
    async function saveEdit(milestone: string, edits: () => Promise<void>) {
      server.set.mockResolvedValueOnce({ ok: true, value: undefined });
      await click(button(row(milestone), 'Edit'));
      await edits();
      await click(button(container, 'Save'));
    }

    function offer() {
      return button(container, 'Draft an update');
    }

    it('drafts an update with the old and new target of a shared milestone', async () => {
      server.draft.mockResolvedValueOnce({ ok: true, value: 'u1' });
      await saveEdit('Closing', async () => {
        type(field('Target'), '2026-12-20');
        type(field('Actual'), '2026-10-15');
      });
      await click(offer());

      expect(server.draft).toHaveBeenCalledWith({
        dealId,
        milestone: 'Closing',
        from: '2026-12-15',
        to: '2026-12-20',
      });
      expect(offer()).toBeUndefined();
      expect(server.refresh).toHaveBeenCalledTimes(2);
    });

    it('offers when a milestone with a target becomes shared', async () => {
      server.draft.mockResolvedValueOnce({ ok: true, value: 'u1' });
      await saveEdit('Landlord consent', () =>
        click(container.querySelector<HTMLElement>('[role="checkbox"]')!),
      );
      await click(offer());

      expect(server.draft).toHaveBeenCalledWith({
        dealId,
        milestone: 'Landlord consent',
        from: '2026-10-14',
        to: '2026-10-14',
      });
    });

    it('offers when an unset shared milestone gets its first target', async () => {
      await saveEdit('APA signing', async () => {
        type(field('Target'), '2026-11-20');
      });

      expect(offer()).toBeDefined();
    });

    it('does not offer for an actual-only change, a team-only milestone, or becoming team only', async () => {
      await saveEdit('Closing', async () => {
        type(field('Actual'), '2026-10-15');
      });
      expect(offer()).toBeUndefined();

      await saveEdit('LOI deadline', async () => {
        type(field('Target'), '2026-10-20');
      });
      expect(offer()).toBeUndefined();

      await saveEdit('Closing', async () => {
        type(field('Target'), '2026-12-20');
        await click(container.querySelector<HTMLElement>('[role="checkbox"]')!);
      });
      expect(offer()).toBeUndefined();
    });

    it('shows the refusal and keeps the offer to retry when the draft cannot be saved', async () => {
      server.draft.mockResolvedValueOnce({
        ok: false,
        refusal: 'This team is read-only until billing is updated.',
      });
      await saveEdit('Closing', async () => {
        type(field('Target'), '2026-12-20');
      });
      await click(offer());

      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        'This team is read-only until billing is updated.',
      );
      expect(offer()).toBeDefined();
    });
  });
});
