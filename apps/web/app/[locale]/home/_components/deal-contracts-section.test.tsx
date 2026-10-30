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
  createLoiExtensionFromTemplate: vi.fn(),
  createNotedLoiExtension: vi.fn(),
  noteLoiExtension: vi.fn(),
  rescheduleLoiExtension: vi.fn(),
  recordLoiExtensionSignedElsewhere: vi.fn(),
  recordSignedCopyOfLoiExtension: vi.fn(),
  draftEditorUrl: vi.fn(
    async (_client: unknown, versionId: string) =>
      `https://sign.example.test/documents/${versionId}/edit`,
  ),
}));
vi.mock('@odb/deal-timeline/apply-contract-dates.ts', () => ({
  applyContractDates: vi.fn(),
  contractDatesPreview: vi.fn(),
}));

import {
  contractVersionViews,
  versionComments,
  visibleContracts,
} from '@odb/contracts';
import { contractDatesPreview } from '@odb/deal-timeline/apply-contract-dates.ts';
import { draftEditorUrl } from '@odb/deals/server';
import { itemAnchor } from '@odb/notifications/relay';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { DealContracts, DealContractsSection } from './deal-contracts-section';

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
    extensions: [],
    versions: [
      {
        id: 'v1',
        version: 1,
        party: 'buyer',
        change_summary: null,
        is_signed: true,
        editorUrl: null,
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
    extensions: [],
    versions: [
      {
        id: 'v2',
        version: 3,
        party: 'buyer',
        change_summary: 'Internal draft',
        is_signed: false,
        editorUrl: null,
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
        editorUrl: null,
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

  describe('LOI extensions', () => {
    function extensionVersion(id: string, changes: object = {}) {
      return {
        id,
        version: 1,
        party: 'buyer',
        change_summary: null,
        is_signed: false,
        editorUrl: null,
        shared: false,
        hasDocx: true,
        hasPdf: true,
        redline: null,
        comments: [],
        review,
        ...changes,
      };
    }

    const extension = {
      note: null,
      noted_on: null,
      current_version: 1,
    };
    const extensions = [
      {
        ...extension,
        id: 'e1',
        extends_to: '2026-12-15',
        state: 'draft' as const,
        versions: [extensionVersion('ev1')],
      },
      {
        ...extension,
        id: 'e2',
        extends_to: '2027-01-15',
        state: 'out' as const,
        versions: [extensionVersion('ev2')],
      },
      {
        ...extension,
        id: 'e3',
        extends_to: '2027-02-15',
        state: 'signed' as const,
        versions: [
          extensionVersion('ev3', { is_signed: true, hasDocx: false }),
        ],
      },
      {
        id: 'e4',
        extends_to: '2027-03-15',
        note: 'Seller agreed by email to thirty more days',
        noted_on: '2026-11-20',
        current_version: null,
        state: 'noted' as const,
        versions: [],
      },
      {
        ...extension,
        id: 'e5',
        extends_to: '2027-04-15',
        state: 'signed' as const,
        versions: [extensionVersion('ev5', { is_signed: true, hasPdf: false })],
      },
    ];

    function withExtensions(loiSigned: boolean) {
      const [loi, apa] = contracts;

      return [
        {
          ...loi!,
          versions: [{ ...loi!.versions[0]!, is_signed: loiSigned }],
          extensions,
        },
        apa!,
      ];
    }

    function cardTitled(document: Document, title: string) {
      return [...document.querySelectorAll('[data-slot="card"]')].find(
        (card) =>
          card.querySelector('[data-slot="card-title"]')?.textContent === title,
      )!;
    }

    function render(canManage: boolean, loiSigned = true) {
      return parse(
        renderToStaticMarkup(
          <DealContracts
            dealId={'d1'}
            contracts={withExtensions(loiSigned)}
            canManage={canManage}
            filesPath={FILES}
            gates={GATES}
          />,
        ),
      );
    }

    function items(document: Document) {
      return [
        ...cardTitled(document, 'LOI').querySelectorAll('[data-extension]'),
      ];
    }

    function texts(elements: Iterable<Element>) {
      return [...elements].map((element) => element.textContent);
    }

    it('lists each extension under its LOI with its end date, state, note, signed copy, and versions', () => {
      expect(
        items(render(false)).map((item) => [
          item.querySelector('h4')?.textContent,
          item.querySelector('[data-slot="badge"]')?.textContent,
          item.querySelector('[data-extension-noted]')?.textContent ?? null,
          [...item.querySelectorAll('[data-extension-actions] a')].map((link) =>
            link.getAttribute('href'),
          ),
          rows(item.innerHTML),
        ]),
      ).toEqual([
        [
          'LOI extension to Dec 15, 2026',
          'Draft',
          null,
          [],
          [['1', 'Buyer', '', '', 'WordPDF']],
        ],
        [
          'LOI extension to Jan 15, 2027',
          'Out for signature',
          null,
          [],
          [['1', 'Buyer', '', '', 'WordPDF']],
        ],
        [
          'LOI extension to Feb 15, 2027',
          'Signed',
          null,
          [`${FILES}/ev3/pdf`],
          [['1', 'Buyer', '', 'Signed', 'PDF']],
        ],
        [
          'LOI extension to Mar 15, 2027',
          'Noted',
          'Agreed on Nov 20, 2026: Seller agreed by email to thirty more days',
          [],
          [],
        ],
        [
          'LOI extension to Apr 15, 2027',
          'Signed',
          null,
          [`${FILES}/ev5/docx`],
          [['1', 'Buyer', '', 'Signed', 'WordPDF conversion failed']],
        ],
      ]);
    });

    it('gives each extension version what an LOI version has', () => {
      const [draft, , , noted, docxOnly] = items(render(true));

      expect(rows(draft!.innerHTML)).toEqual([
        ['1', 'Buyer', '', '', 'WordPDF', 'Current', 'Share with seller side'],
      ]);
      expect(rows(docxOnly!.innerHTML)[0]![4]).toBe(
        'WordPDF conversion failedRetry PDF',
      );
      expect(
        [...draft!.querySelectorAll('tr[id], section[id]')].map(
          (element) => element.id,
        ),
      ).toEqual([
        itemAnchor({ kind: 'contract-version', id: 'ev1' }),
        itemAnchor({ kind: 'contract-review', id: 'ev1' }),
      ]);
      expect(
        texts(draft!.querySelectorAll('[data-version-comments] h3')),
      ).toEqual(['Comments on version 1']);
      expect(
        draft!.querySelector('[data-version-comments] [data-new-comment]'),
      ).not.toBeNull();
      expect(noted!.querySelector('table')).toBeNull();
    });

    function actionButtons(document: Document) {
      return items(document).map((item) =>
        texts(item.querySelectorAll('[data-extension-actions] button')),
      );
    }

    function sendButtons(document: Document) {
      return items(document).map((item) =>
        texts(item.querySelectorAll('[data-version-review] button')),
      );
    }

    function headerButtons(document: Document, title: string) {
      return texts(
        cardTitled(document, title).querySelectorAll(
          '[data-slot="card-header"] button',
        ),
      );
    }

    it('offers a manager each path that fits the state of each extension of the signed LOI', () => {
      const document = render(true);

      expect(headerButtons(document, 'LOI')).toEqual([
        'Record signed LOI',
        'Extend exclusivity',
      ]);
      expect(headerButtons(document, 'APA')).toEqual(['Record signed APA']);
      expect(actionButtons(document)).toEqual([
        ['Change end date', 'Note as agreed', 'Record signed LOI extension'],
        [],
        [],
        ['Record signed LOI extension'],
        [],
      ]);
      expect(sendButtons(document)).toEqual([
        ['Ask counsel to review', 'Override and send'],
        [],
        [],
        [],
        [],
      ]);
    });

    it('offers no extension paths when the LOI is not signed', () => {
      const document = render(true, false);

      expect(headerButtons(document, 'LOI')).toEqual(['Record signed LOI']);
      expect(actionButtons(document)).toEqual([[], [], [], [], []]);
      expect(sendButtons(document)).toEqual([[], [], [], [], []]);
    });

    it('offers a member without deals.manage no extension paths', () => {
      const document = render(false);

      expect(headerButtons(document, 'LOI')).toEqual([]);
      expect(actionButtons(document)).toEqual([[], [], [], [], []]);
      expect(sendButtons(document)).toEqual([[], [], [], [], []]);
    });
  });

  describe('loaded fresh from the database', () => {
    const tables: Record<string, object[]> = {
      contract_version: [
        { id: 'v1', shared_at: null, signing_status: 'draft' },
        { id: 'v2', shared_at: null, signing_status: 'sent' },
        { id: 'v3', shared_at: null, signing_status: null },
      ],
      contract: [],
      contract_review_request: [],
      contract_review_decision: [],
      contract_signing_override: [],
      deal_counsel: [],
    };

    function query(table: string) {
      const chain: object = new Proxy(
        {},
        {
          get: (_target, method) =>
            method === 'throwOnError'
              ? async () => ({ data: tables[table] })
              : () => chain,
        },
      );

      return chain;
    }

    let canManage = true;
    const client = {
      from: query,
      rpc: (name: string) => ({
        throwOnError: async () => ({
          data: name === 'has_deal_permission' ? canManage : true,
        }),
      }),
    };

    async function load() {
      vi.mocked(getSupabaseServerClient).mockReturnValue(client as never);
      vi.mocked(getSupabaseServerAdminClient).mockReturnValue(client as never);
      vi.mocked(contractDatesPreview).mockResolvedValue(null);
      vi.mocked(versionComments).mockResolvedValue({ v1: [], v2: [], v3: [] });
      vi.mocked(contractVersionViews).mockImplementation(
        async (_admin, versions) =>
          versions.map((version) => ({
            ...version,
            hasDocx: false,
            hasPdf: true,
            redline: null,
          })),
      );
      vi.mocked(visibleContracts).mockResolvedValue([
        {
          id: 'c1',
          type: 'loi',
          current_version: 1,
          versions: [
            {
              id: 'v1',
              version: 1,
              party: 'buyer',
              change_summary: null,
              is_signed: false,
            },
          ],
        },
        {
          id: 'c2',
          type: 'apa',
          current_version: 2,
          versions: [
            {
              id: 'v2',
              version: 1,
              party: 'buyer',
              change_summary: null,
              is_signed: false,
            },
            {
              id: 'v3',
              version: 2,
              party: 'buyer',
              change_summary: null,
              is_signed: false,
            },
          ],
        },
      ]);

      return [
        ...parse(
          renderToStaticMarkup(
            await DealContractsSection({ dealId: 'd1', filesPath: FILES }),
          ),
        ).querySelectorAll('[data-version-review] a'),
      ].map((link) => [link.textContent, link.getAttribute('href')]);
    }

    it('links each version that is a Documenso draft to the editor to place its signature fields', async () => {
      canManage = true;

      expect(await load()).toEqual([
        [
          'Open in Documenso to place signature fields',
          'https://sign.example.test/documents/v1/edit',
        ],
      ]);
    });

    it('never asks Documenso for the editor, or links it, for a member without deals.manage', async () => {
      canManage = false;
      vi.mocked(draftEditorUrl).mockClear();

      expect(await load()).toEqual([]);
      expect(draftEditorUrl).not.toHaveBeenCalled();
    });
  });
});
