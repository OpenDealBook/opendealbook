// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NamedVersion } from '../../../../../../_components/calc-version-name';
import {
  announced,
  button,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  linkTo,
  links,
  pageText,
  press,
  settle,
  show,
  type,
} from '../../../../../../_components/lender-test-kit';
import { parseDealCalcDefaults } from '../../../../../../_lib/deal-calc-defaults';
import { CalcVersionEditor } from './calc-version-editor';

vi.mock(
  'next/navigation',
  async () =>
    (await import('../../../../../../_components/lender-test-kit')).navigation,
);
vi.mock('@odb/deals/server', async () =>
  (await import('../../../../../../_components/lender-test-kit')).fakeActions(
    'saveWorkingCapitalCalc',
    'saveSdeCalc',
  ),
);

beforeEach(() => {
  fakeServer.reset();
  window.history.replaceState(null, '', `${CALCS}/wc-1`);
});
afterEach(async () => {
  clearScreen();
  document.querySelectorAll('body > a').forEach((anchor) => anchor.remove());
  await historyTraversed();
});

// jsdom moves through history in two chained setImmediate steps; two chained
// steps queued after them run only once every traversal already started has
// landed.
function historyTraversed(): Promise<void> {
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
}

function nextPopstate(): Promise<unknown> {
  return new Promise((resolve) =>
    window.addEventListener('popstate', resolve, { once: true }),
  );
}

async function untilPopstate(start: () => void) {
  await act(async () => {
    const landed = nextPopstate();
    start();
    await landed;
  });
}

const CALCS = '/home/acme/deals/deal-1/financials/calcs';
const FINANCIALS = '/home/acme/deals/deal-1/financials';

const NO_SOURCES = {
  calcVersionId: 'wc-1',
  dealId: 'deal-1',
  canEdit: true,
  citations: [],
  documents: [],
};

const detail = {
  version: {
    id: 'wc-1',
    name: 'Q3 working capital',
    type: 'working_capital',
    is_primary: false,
  },
  periods: [],
  input: {
    inputs: {
      current_assets: 450000,
      current_liabilities: 120000,
      avg_monthly_revenue: 200000,
    },
    imported_from_version_id: null,
  },
  funding_sources: [],
  sources: NO_SOURCES,
} as unknown as Parameters<typeof CalcVersionEditor>[0]['detail'];

const savedAt = new Date(2026, 9, 20, 15, 14).toISOString();

function calc(
  id: string,
  name: string | null,
  type: string,
  created_at: string,
): NamedVersion {
  return {
    id,
    name,
    type,
    created_at,
    updated_at: savedAt,
    outputs_snapshot: { saved: true },
  };
}

const VERSIONS = [
  calc('wc-1', 'Q3 working capital', 'working_capital', '2026-10-01T00:00:00Z'),
  calc('wc-2', 'Q4 working capital', 'working_capital', '2026-10-02T00:00:00Z'),
  calc('deal-a', 'Base case', 'deal', '2026-10-03T00:00:00Z'),
];

function showEditor(shown = detail, versions = VERSIONS) {
  show(
    <CalcVersionEditor
      detail={shown}
      versions={versions}
      defaults={parseDealCalcDefaults(null)}
      dealBox={{ set: true, href: '/home/acme/underwriting' }}
      financialsHref={FINANCIALS}
      calcsHref={CALCS}
    />,
  );
}

it('edits the saved version on its own page with a way back to Financials', () => {
  showEditor();

  expect(document.querySelector('h1')!.textContent).toBe('Q3 working capital');
  expect(linkTo('Back to Financials')).toBe(FINANCIALS);
  expect(field('Current assets').value).toBe('450,000');
});

it('saves, stays on the page with the new outputs and says Saved', async () => {
  fakeServer.pathname = `${CALCS}/wc-1`;
  showEditor();

  await type('Current assets', '500,000');
  await press('Save');
  await settle();

  expect(fakeServer.inputsTo('saveWorkingCapitalCalc')).toEqual([
    {
      calc_version_id: 'wc-1',
      current_assets: 500000,
      current_liabilities: 120000,
      avg_monthly_revenue: 200000,
    },
  ]);
  expect(fakeServer.pathname).toBe(`${CALCS}/wc-1`);
  expect(announced()).toEqual(['Saved']);
  expect(pageText()).toContain('$380,000');
  expect(field('Current assets').value).toBe('500,000');
});

it('drops the Saved note once the version is edited again', async () => {
  showEditor();

  await press('Save');
  await settle();
  await type('Current assets', '1');

  expect(announced()).toEqual([]);
});

it('says Saved after saving an SDE version too, and stays', async () => {
  fakeServer.pathname = `${CALCS}/sde-1`;
  showEditor({
    version: { id: 'sde-1', name: '2024 SDE', type: 'sde', is_primary: false },
    periods: [
      {
        id: 'period-a',
        label: 'FY2024',
        weight: 1,
        months: null,
        created_at: '2025-01-01',
        sde_line: [
          {
            id: 'line-1',
            line_code: 'sales',
            custom_label: null,
            amount: 900000,
          },
        ],
      },
    ],
    input: null,
    funding_sources: [],
    sources: { ...NO_SOURCES, calcVersionId: 'sde-1' },
  } as unknown as Parameters<typeof CalcVersionEditor>[0]['detail']);

  await press('Save');
  await settle();

  expect(fakeServer.inputsTo('saveSdeCalc')).toHaveLength(1);
  expect(fakeServer.pathname).toBe(`${CALCS}/sde-1`);
  expect(announced()).toEqual(['Saved']);
});

it('names unnamed versions by their number and when they were saved', () => {
  const saved = calc('sde-1', null, 'sde', '2026-10-01T00:00:00Z');
  const unsaved = {
    ...calc('sde-2', null, 'sde', '2026-10-03T00:00:00Z'),
    outputs_snapshot: {},
  };
  showEditor(
    {
      version: { ...unsaved, is_primary: false },
      periods: [],
      input: null,
      funding_sources: [],
      sources: { ...NO_SOURCES, calcVersionId: 'sde-2' },
    } as unknown as Parameters<typeof CalcVersionEditor>[0]['detail'],
    [unsaved, saved],
  );

  expect(document.querySelector('h1')!.textContent).toBe('SDE v2, not saved');
  expect(linkTo('SDE v1, saved Oct 20 3:14 PM')).toBe(
    `${CALCS}/compare?a=sde-2&b=sde-1`,
  );
});

it('keeps Save and the weighted SDE in a bar pinned to the bottom of the window', () => {
  showEditor({
    version: { id: 'sde-1', name: '2024 SDE', type: 'sde', is_primary: false },
    periods: [],
    input: null,
    funding_sources: [],
    sources: { ...NO_SOURCES, calcVersionId: 'sde-1' },
  } as unknown as Parameters<typeof CalcVersionEditor>[0]['detail']);
  const bar = button('Save').closest('.sticky');

  expect(bar?.className).toMatch(/\bbottom-0\b/);
  expect(bar?.textContent).toContain('Weighted SDE');
});

it("shows each input's data room sources", () => {
  showEditor({
    ...detail,
    sources: {
      ...NO_SOURCES,
      citations: [
        {
          id: 'cite-1',
          rowId: null,
          inputKey: 'current_assets',
          documentId: 'doc-1',
          documentName: 'balance-sheet.xlsx',
          documentVersion: 1,
          locator: { kind: 'sheet', sheet: 'Q3' },
          cell: 'C4',
          newerVersionUploaded: false,
          documentRemoved: false,
        },
      ],
    },
  });

  expect(button('Cite source for Current assets').textContent).toBe('1 source');
});

it('has no Cancel; Back to Financials is the way out', () => {
  showEditor();

  expect(pageText()).not.toContain('Cancel');
});

it('opens this calc in a reusable named window for side-by-side work', async () => {
  const opened: unknown[][] = [];
  window.open = (...args: unknown[]) => {
    opened.push(args);
    return null;
  };
  showEditor();

  await press('Open in new window');
  await press('Open in new window');

  expect(opened).toEqual([
    [`${CALCS}/wc-1`, 'odb-calc-wc-1', 'popup'],
    [`${CALCS}/wc-1`, 'odb-calc-wc-1', 'popup'],
  ]);
});

it('offers to compare with the other versions of the same calc only', () => {
  showEditor();

  expect(linkTo('Q4 working capital')).toBe(`${CALCS}/compare?a=wc-1&b=wc-2`);
  expect(links().map((link) => link.text)).not.toContain('Base case');
});

function followLink(text: string, init: MouseEventInit = {}) {
  const anchor = [...document.querySelectorAll('a')].find(
    (each) => each.textContent === text,
  )!;
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    anchor.dispatchEvent(event);
  });
  return event;
}

function reload() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe('leaving with unsaved edits', () => {
  beforeEach(() => {
    fakeServer.pathname = `${CALCS}/wc-1`;
  });

  it('asks before following a link and stays when kept', async () => {
    showEditor();
    await type('Current assets', '500,000');

    expect(followLink('Back to Financials').defaultPrevented).toBe(true);
    expect(dialogText()).toContain('Discard unsaved changes?');

    await press('Keep editing');

    expect(dialogText()).toBeNull();
    expect(fakeServer.pathname).toBe(`${CALCS}/wc-1`);
    expect(field('Current assets').value).toBe('500,000');
  });

  it('goes where the link points once changes are discarded', async () => {
    showEditor();
    await type('Current assets', '500,000');
    followLink('Q4 working capital');

    await untilPopstate(() => button('Discard changes').click());

    expect(fakeServer.pathname).toBe(`${CALCS}/compare?a=wc-1&b=wc-2`);
  });

  it('lets links through without asking when nothing is unsaved', async () => {
    showEditor();

    expect(followLink('Back to Financials').defaultPrevented).toBe(false);

    await type('Current assets', '500,000');
    await press('Save');
    await settle();

    expect(followLink('Back to Financials').defaultPrevented).toBe(false);
    expect(dialogText()).toBeNull();
  });

  it('asks the browser to confirm a close or reload only while edits are unsaved', async () => {
    showEditor();

    expect(reload().defaultPrevented).toBe(false);

    await type('Current assets', '500,000');

    expect(reload().defaultPrevented).toBe(true);

    await press('Save');
    await settle();

    expect(reload().defaultPrevented).toBe(false);
  });

  it.each([
    ['cmd-click', { metaKey: true }],
    ['ctrl-click', { ctrlKey: true }],
    ['shift-click', { shiftKey: true }],
    ['middle-click', { button: 1 }],
  ])('lets a %s through, since it opens elsewhere', async (_case, init) => {
    showEditor();
    await type('Current assets', '500,000');

    expect(followLink('Back to Financials', init).defaultPrevented).toBe(false);
    expect(dialogText()).toBeNull();
  });

  it('lets a link that opens in a new tab through', async () => {
    showEditor();
    document.body.append(
      Object.assign(document.createElement('a'), {
        href: '/home/acme/deals/deal-1/documents',
        target: '_blank',
        textContent: 'Data room',
      }),
    );
    await type('Current assets', '500,000');

    expect(followLink('Data room').defaultPrevented).toBe(false);
    expect(dialogText()).toBeNull();
  });

  it('asks before a same-window external link and leaves the app once discarded', async () => {
    const opened: unknown[][] = [];
    window.open = (...args: unknown[]) => {
      opened.push(args);
      return null;
    };
    showEditor();
    document.body.append(
      Object.assign(document.createElement('a'), {
        href: 'https://example.com/lender-portal?loan=7',
        textContent: 'Lender portal',
      }),
    );
    await type('Current assets', '500,000');

    expect(followLink('Lender portal').defaultPrevented).toBe(true);
    expect(dialogText()).toContain('Discard unsaved changes?');

    await press('Discard changes');

    expect(opened).toEqual([
      ['https://example.com/lender-portal?loan=7', '_self'],
    ]);
    expect(fakeServer.pathname).toBe(`${CALCS}/wc-1`);
  });
});

async function browserBack() {
  await untilPopstate(() => window.history.back());
}

describe('browser Back with unsaved edits', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', FINANCIALS);
    window.history.pushState(null, '', `${CALCS}/wc-1`);
  });

  it('asks before going back and stays put with the edits when kept', async () => {
    showEditor();
    await type('Current assets', '500,000');

    await browserBack();

    expect(dialogText()).toContain('Discard unsaved changes?');
    expect(window.location.pathname).toBe(`${CALCS}/wc-1`);

    await press('Keep editing');
    await settle();

    expect(dialogText()).toBeNull();
    expect(field('Current assets').value).toBe('500,000');

    await browserBack();

    expect(dialogText()).toContain('Discard unsaved changes?');
    expect(window.location.pathname).toBe(`${CALCS}/wc-1`);
  });

  it('completes the Back once changes are discarded', async () => {
    showEditor();
    await type('Current assets', '500,000');
    await browserBack();

    await untilPopstate(() => button('Discard changes').click());

    expect(window.location.pathname).toBe(FINANCIALS);
  });

  it('goes back in one step without asking once the edits are saved', async () => {
    showEditor();
    await type('Current assets', '500,000');
    const guardLeft = nextPopstate();
    await press('Save');
    await act(() => guardLeft);

    await browserBack();

    expect(dialogText()).toBeNull();
    expect(window.location.pathname).toBe(FINANCIALS);
  });

  it('leaves no extra history entry behind when a link is followed after discarding', async () => {
    showEditor();
    await type('Current assets', '500,000');
    followLink('Q4 working capital');

    await untilPopstate(() => button('Discard changes').click());

    const comparePath = `${CALCS}/compare?a=wc-1&b=wc-2`;
    expect(fakeServer.pathname).toBe(comparePath);
    clearScreen();
    window.history.pushState(null, '', comparePath);

    await browserBack();
    expect(window.location.pathname).toBe(`${CALCS}/wc-1`);

    await browserBack();
    expect(window.location.pathname).toBe(FINANCIALS);
  });
});
