// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  button,
  clearScreen,
  field,
  press,
  show,
  type,
} from '@odb/lender-rooms/requests-ui/test-support/screen.ts';

const refused = vi.hoisted(() => async () => ({
  ok: false as const,
  refusal: "Read-only members can't change this deal's schedule. Ask a deal manager.",
}));

const server = vi.hoisted(() => ({
  scheduleFromTemplate: vi.fn(async () => ({ ok: true, value: undefined })),
  scheduleFromLoiSigned: vi.fn(
    async (): Promise<
      { ok: true; value: undefined } | { ok: false; refusal: string }
    > => ({ ok: true, value: undefined }),
  ),
}));

vi.mock('@odb/diligence/server', () => ({
  ...server,
  acceptSchedule: refused,
  slipUnreceived: refused,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

import { ScheduleManager, ScheduleStarter } from './schedule-manager';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(clearScreen);

const templates = [
  { id: '7a1c0d52-0d1e-4b5e-9f0a-1a2b3c4d5e6f', name: 'Standard diligence' },
  { id: '8b2d1e63-1e2f-4c6f-8a1b-2b3c4d5e6f70', name: 'Lean diligence' },
];

describe('ScheduleStarter', () => {
  it('applies the chosen checklist template and schedules from the start date', async () => {
    show(<ScheduleStarter dealId={'deal-1'} templates={templates} />);

    const picker = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Checklist template"]',
    )!;
    await act(async () => {
      picker.value = templates[1]!.id;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await type('Schedule starts on', '2026-11-02');
    await press('Apply template');

    expect(server.scheduleFromTemplate).toHaveBeenCalledWith({
      dealId: 'deal-1',
      templateId: templates[1]!.id,
      startDate: '2026-11-02',
    });
  });

  it('records the LOI signed date and schedules from it', async () => {
    show(<ScheduleStarter dealId={'deal-1'} templates={templates} />);

    await type('LOI signed on', '2026-10-05');
    await press('Set LOI signed date');

    expect(server.scheduleFromLoiSigned).toHaveBeenCalledWith({
      dealId: 'deal-1',
      signedOn: '2026-10-05',
    });
  });

  it('starts the template schedule today unless another date is chosen', () => {
    show(<ScheduleStarter dealId={'deal-1'} templates={templates} />);

    expect(field('Schedule starts on').value).toBe(
      new Date().toLocaleDateString('en-CA'),
    );
    expect(button('Apply template').disabled).toBe(false);
  });

  it('waits for the LOI signed date and allows no date after today', () => {
    show(<ScheduleStarter dealId={'deal-1'} templates={templates} />);

    expect(button('Set LOI signed date').disabled).toBe(true);
    expect(field('LOI signed on').getAttribute('max')).toBe(
      new Date().toLocaleDateString('en-CA'),
    );
  });

  it('shows a refusal next to the form', async () => {
    server.scheduleFromLoiSigned.mockResolvedValueOnce({
      ok: false,
      refusal: "You can't change this deal's schedule.",
    });
    show(<ScheduleStarter dealId={'deal-1'} templates={templates} />);

    await type('LOI signed on', '2026-10-05');
    await press('Set LOI signed date');

    expect(alerts()).toContain("You can't change this deal's schedule.");
  });
});

describe('ScheduleManager', () => {
  const weeks = [
    { id: 'week-1', week_no: 1, theme: 'Financials', starts_on: null, status: null },
    { id: 'week-2', week_no: 2, theme: 'Legal', starts_on: null, status: null },
  ] as never;

  it.each(['Activate schedule', 'Slip unreceived'])(
    'shows why %s was refused',
    async (label) => {
      show(
        <ScheduleManager scheduleId={'sched-1'} status={'proposed'} weeks={weeks} />,
      );

      await press(label);

      expect(alerts()).toContain(
        "Read-only members can't change this deal's schedule. Ask a deal manager.",
      );
    },
  );
});
