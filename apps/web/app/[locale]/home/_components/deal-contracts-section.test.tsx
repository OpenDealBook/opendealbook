// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from './fake-realtime';

vi.mock('@odb/contracts/server', () => ({
  setContractVersionShared: vi.fn(),
  adoptContractVersion: vi.fn(),
  retryContractVersionPdf: vi.fn(),
  addContractComment: vi.fn(),
  replyToContractComment: vi.fn(),
  resolveContractComment: vi.fn(),
  reopenContractComment: vi.fn(),
}));
vi.mock('@odb/contracts', () => ({
  contractVersionViews: vi.fn(),
  versionComments: vi.fn(),
  visibleContracts: vi.fn(),
  requestContractReview: vi.fn(),
  decideContractReview: vi.fn(),
  overrideContractSigning: vi.fn(),
  setDealReviewGate: vi.fn(),
}));
vi.mock('@odb/supabase/server', () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock('@odb/supabase/admin', () => ({
  getSupabaseServerAdminClient: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => fakeRealtime().client,
}));
vi.mock('@odb/deals/server', () => ({
  recordContractSignedElsewhere: vi.fn(),
  sendContractForSignature: vi.fn(),
}));
vi.mock('@odb/deal-timeline/apply-contract-dates.ts', () => ({
  applyContractDates: vi.fn(),
  contractDatesPreview: vi.fn(),
}));

import { DealContracts } from './deal-contracts-section';

function parse(markup: string) {
  return new DOMParser().parseFromString(markup, 'text/html');
}

function rows(markup: string) {
  return [...parse(markup).querySelectorAll('tr')]
    .map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent),
    )
    .filter((cells) => cells.length > 0);
}

const FILES = '/home/team-one/deals/d1/contracts/files';
const GATES = { loi: false, apa: true };

const review = {
  required: true,
  ready: false,
  sendable: true,
  counsel: { buyer: true, seller: true },
  requests: [],
  decisions: [],
  overrides: [],
};

const contracts = [
  {
    id: 'c1',
    type: 'loi',
    current_version: 1,
    dates: null,
    versions: [
      {
        id: 'v1',
        version: 1,
        party: 'buyer',
        change_summary: null,
        is_signed: true,
        shared: true,
        hasDocx: false,
        hasPdf: true,
        redline: null,
        comments: [],
        review,
      },
    ],
  },
  {
    id: 'c2',
    type: 'apa',
    current_version: 3,
    dates: [
      {
        kind: 'closing' as const,
        label: 'Closing',
        from: null,
        to: '2026-12-01',
      },
    ],
    versions: [
      {
        id: 'v2',
        version: 3,
        party: 'buyer',
        change_summary: 'Internal draft',
        is_signed: false,
        shared: false,
        hasDocx: true,
        hasPdf: false,
        redline: null,
        comments: [],
        review,
      },
      {
        id: 'v3',
        version: 4,
        party: 'seller',
        change_summary: 'Seller redline',
        is_signed: false,
        shared: true,
        hasDocx: true,
        hasPdf: true,
        redline: [
          { type: 'unchanged' as const, text: 'Price is' },
          { type: 'removed' as const, text: '2.1M' },
          { type: 'added' as const, text: '2.4M' },
        ],
        comments: [
          {
            id: 'k1',
            author: { name: 'Dana Lee', role: 'seller_counsel' as const },
            side: 'seller' as const,
            quotedText: null,
            body: 'Price is firm',
            internal: false,
            resolved: false,
            replies: [],
          },
        ],
        review: {
          ...review,
          requests: [{ requestedAt: '2026-10-02T15:00:00Z' }],
        },
      },
    ],
  },
];

describe('DealContracts', () => {
  it('lists every contract with its real version numbers, sides, files, and share state for a manager', () => {
    const markup = renderToStaticMarkup(
      <DealContracts
        dealId={'d1'}
        contracts={contracts}
        canManage={true}
        filesPath={FILES}
        gates={GATES}
      />,
    );
    const document = parse(markup);

    expect(
      [...document.querySelectorAll('[data-slot="card-title"]')].map(
        (title) => title.textContent,
      ),
    ).toEqual(['Contracts', 'LOI', 'APA']);
    expect(rows(markup)).toEqual([
      ['1', 'Buyer', '', 'Signed', 'PDF', 'Current', 'Stop sharing'],
      [
        '3',
        'Buyer',
        'Internal draft',
        '',
        'WordPDF conversion failedRetry PDF',
        'Current',
        'Share with seller side',
      ],
      ['4', 'Seller', 'Seller redline', '', 'WordPDF', 'Make current', ''],
    ]);
    expect(
      [...document.querySelectorAll('a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      `${FILES}/v1/pdf`,
      `${FILES}/v2/docx`,
      `${FILES}/v3/docx`,
      `${FILES}/v3/pdf`,
    ]);
  });

  it('shows what each version changed from the one before', () => {
    const document = parse(
      renderToStaticMarkup(
        <DealContracts
          dealId={'d1'}
          contracts={contracts}
          canManage={true}
          filesPath={FILES}
          gates={GATES}
        />,
      ),
    );

    expect(document.querySelector('summary')?.textContent).toBe(
      'Changes in version 4',
    );
    expect(
      [...document.querySelectorAll('del')].map((d) => d.textContent),
    ).toEqual(['2.1M']);
    expect(
      [...document.querySelectorAll('ins')].map((i) => i.textContent),
    ).toEqual(['2.4M']);
  });

  it('shows a member without deals.manage the contracts with no share controls', () => {
    const markup = renderToStaticMarkup(
      <DealContracts
        dealId={'d1'}
        contracts={contracts}
        canManage={false}
        filesPath={FILES}
        gates={GATES}
      />,
    );

    expect(parse(markup).querySelectorAll('button')).toHaveLength(0);
    expect(rows(markup)).toEqual([
      ['1', 'Buyer', '', 'Signed', 'PDF'],
      ['3', 'Buyer', 'Internal draft', '', 'WordPDF conversion failed'],
      ['4', 'Seller', 'Seller redline', '', 'WordPDF'],
    ]);
  });

  function buttonNames(markup: string) {
    return [...parse(markup).querySelectorAll('button')].map(
      (button) => button.textContent,
    );
  }

  it('offers a manager of a deal with no contracts to record a signed LOI or APA', () => {
    expect(
      buttonNames(
        renderToStaticMarkup(
          <DealContracts
            dealId={'d1'}
            contracts={[]}
            canManage={true}
            filesPath={FILES}
            gates={GATES}
          />,
        ),
      ).filter((name) => name?.startsWith('Record signed')),
    ).toEqual(['Record signed LOI', 'Record signed APA']);
  });

  it('offers to record a signed copy of each contract, and of a type the deal lacks', () => {
    const names = buttonNames(
      renderToStaticMarkup(
        <DealContracts
          dealId={'d1'}
          contracts={[contracts[0]!]}
          canManage={true}
          filesPath={FILES}
          gates={GATES}
        />,
      ),
    );

    expect(names.filter((name) => name?.startsWith('Record signed'))).toEqual([
      'Record signed APA',
      'Record signed LOI',
    ]);
  });

  it('puts each record signed action in the header of the card it records into', () => {
    const document = parse(
      renderToStaticMarkup(
        <DealContracts
          dealId={'d1'}
          contracts={[contracts[0]!]}
          canManage={true}
          filesPath={FILES}
          gates={GATES}
        />,
      ),
    );

    expect(
      [...document.querySelectorAll('button')]
        .filter((button) => button.textContent?.startsWith('Record signed'))
        .map((button) => [
          button.textContent,
          button
            .closest('[data-slot="card-header"]')
            ?.querySelector('[data-slot="card-title"]')?.textContent,
        ]),
    ).toEqual([
      ['Record signed APA', 'Contracts'],
      ['Record signed LOI', 'LOI'],
    ]);
  });

  it('says so when the deal has no contracts', () => {
    expect(
      renderToStaticMarkup(
        <DealContracts
          dealId={'d1'}
          contracts={[]}
          canManage={true}
          filesPath={FILES}
          gates={GATES}
        />,
      ),
    ).toContain('No contracts yet.');
  });

  it('offers a manager to apply dates only on a contract that states some', () => {
    const document = parse(
      renderToStaticMarkup(
        <DealContracts
          dealId={'d1'}
          contracts={contracts}
          canManage={true}
          filesPath={FILES}
          gates={GATES}
        />,
      ),
    );

    expect(
      [...document.querySelectorAll('[data-slot="card"]')]
        .slice(1)
        .map((card) =>
          [...card.querySelectorAll('button')].some(
            (button) => button.textContent === 'Apply contract dates',
          ),
        ),
    ).toEqual([false, true]);
  });

  it("shows each version's comments, with a form for a manager only", () => {
    const comments = (canManage: boolean) =>
      [
        ...parse(
          renderToStaticMarkup(
            <DealContracts
              dealId={'d1'}
              contracts={contracts}
              canManage={canManage}
              filesPath={FILES}
              gates={GATES}
            />,
          ),
        ).querySelectorAll('[data-version-comments]'),
      ].map((section) => [
        section.querySelector('h3')?.textContent,
        [...section.querySelectorAll('[data-body]')].map((b) => b.textContent),
        section.querySelector('[data-new-comment]') !== null,
      ]);

    expect(comments(true)).toEqual([
      ['Comments on version 1', [], true],
      ['Comments on version 3', [], true],
      ['Comments on version 4', ['Price is firm'], true],
    ]);
    expect(comments(false).map(([, , form]) => form)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("shows each version's counsel sign-off to the whole team", () => {
    const signOff = (canManage: boolean) =>
      [
        ...parse(
          renderToStaticMarkup(
            <DealContracts
              dealId={'d1'}
              contracts={contracts}
              canManage={canManage}
              filesPath={FILES}
              gates={GATES}
            />,
          ),
        ).querySelectorAll('[data-version-review]'),
      ].map((section) => [
        section.querySelector('h3')?.textContent,
        [...section.querySelectorAll('[data-review-side] dd')].map(
          (status) => status.textContent,
        ),
      ]);

    const waiting = ['Waiting since Oct 2, 2026', 'Waiting since Oct 2, 2026'];
    const unasked = ['Not requested yet', 'Not requested yet'];

    expect(signOff(false)).toEqual([
      ['Counsel sign-off on version 1', unasked],
      ['Counsel sign-off on version 3', unasked],
      ['Counsel sign-off on version 4', waiting],
    ]);
    expect(signOff(true)).toEqual(signOff(false));
  });

  it("lets a manager alone choose which of the deal's contracts need counsel sign-off", () => {
    const gates = (canManage: boolean) =>
      [
        ...parse(
          renderToStaticMarkup(
            <DealContracts
              dealId={'d1'}
              contracts={contracts}
              canManage={canManage}
              filesPath={FILES}
              gates={GATES}
            />,
          ),
        ).querySelectorAll('[aria-label$="needs counsel sign-off"]'),
      ].map((box) => [
        box.getAttribute('aria-label'),
        box.getAttribute('aria-checked'),
      ]);

    expect(gates(true)).toEqual([
      ['LOI needs counsel sign-off', 'false'],
      ['APA needs counsel sign-off', 'true'],
    ]);
    expect(gates(false)).toEqual([]);
  });
});
