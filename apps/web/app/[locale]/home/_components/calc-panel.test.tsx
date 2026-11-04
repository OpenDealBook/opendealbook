// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en.json';
import { CalculatorsPanel } from './calc-panel';
import {
  alerts,
  button,
  buttonNames,
  clearScreen,
  fakeServer,
  linkTo,
  press,
  settle,
  show,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'createCalcVersion',
    'adoptCalcVersion',
    'deleteCalcVersion',
    'duplicateCalcVersion',
    'markPrimaryCalcVersion',
  ),
);

beforeEach(() => fakeServer.reset());
afterEach(clearScreen);

const NO_ACCESS = 'Ask a teammate who can manage calculators to start one.';

const withNoAccessCopy = {
  ...messages,
  empty: {
    ...messages.empty,
    calculators: {
      ...messages.empty.calculators,
      descriptionNoAccess: NO_ACCESS,
    },
  },
};

const MANAGER_NOTE = 'Only deal managers can mark a calc primary or adopt it.';

function showEmpty({ canManage = true, canCreate = true } = {}) {
  show(
    <NextIntlClientProvider locale={'en'} messages={withNoAccessCopy}>
      <CalculatorsPanel
        dealId={'deal-1'}
        versions={[]}
        canManage={canManage}
        canCreate={canCreate}
        calcsHref={'/home/acme/deals/deal-1/financials/calcs'}
      />
    </NextIntlClientProvider>,
  );
}

it('offers nothing to create to someone who cannot create calculators, and sends them to a teammate', () => {
  showEmpty({ canManage: false, canCreate: false });

  const empty = document.querySelector('[data-slot="empty-state"]')!;
  expect(empty.querySelector('h2')!.textContent).toBe(
    messages.empty.calculators.title,
  );
  expect(empty.textContent).toContain(NO_ACCESS);
  expect(buttonNames()).toEqual([]);
});

it('leaves out the deal-manager note while the deal has no calculator', () => {
  showEmpty({ canManage: false, canCreate: true });

  expect(document.body.textContent).not.toContain(MANAGER_NOTE);
  expect(buttonNames()).toEqual(['New SDE', 'New Deal', 'New Working capital']);
});

it('offers the New buttons in the empty state, and only there, before the deal has a calculator', async () => {
  fakeServer.values.createCalcVersion = 'v-new';
  showEmpty();

  const empty = document.querySelector('[data-slot="empty-state"]')!;
  expect(empty.querySelector('h2')!.textContent).toBe(
    messages.empty.calculators.title,
  );
  expect(
    [...empty.querySelectorAll('button')].map((each) => each.textContent),
  ).toEqual(['New SDE', 'New Deal', 'New Working capital']);
  expect(buttonNames()).toEqual(['New SDE', 'New Deal', 'New Working capital']);

  await press('New SDE');
  await settle();

  expect(fakeServer.inputsTo('createCalcVersion')).toEqual([
    { deal_id: 'deal-1', type: 'sde' },
  ]);
  expect(fakeServer.pathname).toBe(
    '/home/acme/deals/deal-1/financials/calcs/v-new',
  );
});

it('shows a refused new calculator inline and leaves the New buttons usable', async () => {
  fakeServer.refusal =
    "Read-only members can't create calculators. Ask a deal manager.";
  showEmpty();

  await press('New SDE');
  await settle();

  expect(alerts()).toEqual([
    "Read-only members can't create calculators. Ask a deal manager.",
  ]);
  expect(button('New SDE').disabled).toBe(false);
});

type Version = Parameters<typeof CalculatorsPanel>[0]['versions'][number];

const version = {
  id: 'v-1',
  name: 'Base case',
  type: 'deal',
  is_primary: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: new Date(2026, 9, 20, 15, 14).toISOString(),
  outputs_snapshot: { dscr: 1.5, purchase_multiple: 3 },
} as unknown as Version;

const CALCS = '/home/acme/deals/deal-1/financials/calcs';

function showVersions(versions: Version[], canManage = true, canCreate = true) {
  show(
    <CalculatorsPanel
      dealId={'deal-1'}
      versions={versions}
      canManage={canManage}
      canCreate={canCreate}
      calcsHref={CALCS}
    />,
  );
}

it('offers no New buttons above the list to someone who cannot create calculators', () => {
  showVersions([version], false, false);

  expect(buttonNames()).not.toContain('New SDE');
  expect(buttonNames()).not.toContain('New Deal');
  expect(buttonNames()).not.toContain('New Working capital');
  expect(document.body.textContent).toContain(MANAGER_NOTE);
});

function showPanel(canManage: boolean) {
  showVersions([version], canManage);
}

function rowOf(name: string): HTMLTableRowElement {
  return [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')].find(
    (row) => row.querySelector('a')?.textContent === name,
  )!;
}

async function openMenu(name: string) {
  await act(async () => {
    rowOf(name)
      .querySelector<HTMLButtonElement>('button[aria-label="More actions"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
  });
}

function menuItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

function menuItem(name: string): HTMLElement {
  return menuItems().find((item) => item.textContent === name)!;
}

async function choose(name: string) {
  await act(async () => {
    menuItem(name).click();
  });
}

it('keeps Open on the row and tucks the other actions into a menu', async () => {
  const primary = {
    ...version,
    id: 'v-0',
    name: 'Primary case',
    is_primary: true,
  } as Version;
  showVersions([version, primary]);

  expect(
    [...rowOf('Base case').querySelectorAll('a, button')].map(
      (each) => each.getAttribute('aria-label') ?? each.textContent,
    ),
  ).toEqual(['Base case', 'Open', 'More actions']);

  await openMenu('Base case');

  expect(menuItems().map((item) => item.textContent)).toEqual([
    'Mark primary',
    'Adopt',
    'Duplicate',
    'Compare',
    'Delete',
  ]);
  expect(menuItem('Compare').getAttribute('href')).toBe(
    `${CALCS}/compare?a=v-1&b=v-0`,
  );
  expect(menuItem('Delete').dataset.variant).toBe('destructive');
});

it('offers Compare only against a primary version of the same type', async () => {
  const sdePrimary = {
    ...version,
    id: 'sde-1',
    name: 'SDE primary',
    type: 'sde',
    is_primary: true,
  } as Version;
  showVersions([version, sdePrimary]);

  await openMenu('Base case');
  expect(menuItem('Compare')).toBeUndefined();
});

it('offers no Compare on the primary version itself', async () => {
  showVersions([{ ...version, is_primary: true } as Version]);

  await openMenu('Base case');
  expect(menuItem('Compare')).toBeUndefined();
});

it('names unnamed versions by type, number and saved time', () => {
  showVersions([
    { ...version, id: 'v-2', name: null, created_at: '2026-10-02T00:00:00Z' },
    { ...version, id: 'v-1', name: null },
  ] as Version[]);

  expect(
    [...document.querySelectorAll('tbody tr')].map(
      (row) => row.querySelector('a')?.textContent,
    ),
  ).toEqual(['Deal v2, saved Oct 20 3:14 PM', 'Deal v1, saved Oct 20 3:14 PM']);
});

it('asks before deleting a calc version and deletes only on confirmation', async () => {
  showPanel(true);

  await openMenu('Base case');
  await choose('Delete');
  await settle();

  expect(fakeServer.inputsTo('deleteCalcVersion')).toEqual([]);
  expect(document.body.textContent).toContain('Delete Base case?');

  await press('Delete version');
  await settle();

  expect(fakeServer.inputsTo('deleteCalcVersion')).toEqual([
    { calc_version_id: 'v-1' },
  ]);
});

it('locks Mark primary and Adopt for anyone who does not manage the deal, saying why', async () => {
  showPanel(false);

  expect(document.body.textContent).toContain(
    'Only deal managers can mark a calc primary or adopt it.',
  );

  await openMenu('Base case');

  expect(menuItem('Mark primary').hasAttribute('data-disabled')).toBe(true);
  expect(menuItem('Adopt').hasAttribute('data-disabled')).toBe(true);
  expect(menuItem('Duplicate').hasAttribute('data-disabled')).toBe(false);
});

it('opens a calc version on its own page', () => {
  showPanel(true);

  expect(linkTo('Open')).toBe(`${CALCS}/v-1`);
  expect(linkTo('Base case')).toBe(`${CALCS}/v-1`);
});

it('takes a new calc version straight to its page', async () => {
  fakeServer.values.createCalcVersion = 'v-new';
  showPanel(true);

  await press('New Deal');
  await settle();

  expect(fakeServer.inputsTo('createCalcVersion')).toEqual([
    { deal_id: 'deal-1', type: 'deal' },
  ]);
  expect(fakeServer.pathname).toBe(`${CALCS}/v-new`);
});

it('names the multiple as including closing costs in the key outputs', () => {
  showPanel(true);

  expect(document.body.textContent).toContain(
    'Purchase multiple incl. closing costs 3.0x',
  );
});

it('offers Adopt only on saved SDE and Deal versions', async () => {
  const versions = [
    { ...version, id: 'deal-saved', name: 'Deal saved' },
    { ...version, id: 'deal-new', name: 'Deal new', outputs_snapshot: {} },
    {
      ...version,
      id: 'sde-saved',
      name: 'SDE saved',
      type: 'sde',
      outputs_snapshot: { type: 'sde', weighted_sde: 1 },
    },
    {
      ...version,
      id: 'wc-saved',
      name: 'WC saved',
      type: 'working_capital',
      outputs_snapshot: { type: 'working_capital', working_capital: 1 },
    },
  ] as Version[];
  const offered: string[] = [];

  for (const each of versions) {
    showVersions(versions);
    await openMenu(each.name!);
    if (menuItem('Adopt')) {
      offered.push(each.name!);
    }
    clearScreen();
  }

  expect(offered).toEqual(['Deal saved', 'SDE saved']);
});
