// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { fakeRealtime } from '../../../home/_components/fake-realtime';

vi.mock('@odb/contracts/server', () => ({
  uploadCounselRedline: vi.fn(),
  retryContractVersionPdf: vi.fn(),
  addContractComment: vi.fn(),
  replyToContractComment: vi.fn(),
  resolveContractComment: vi.fn(),
  reopenContractComment: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@odb/supabase/hooks', () => ({
  useSupabase: () => fakeRealtime().client,
}));

import { ContractList } from './contract-list';

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

const contracts = [
  {
    id: 'c1',
    type: 'apa',
    extensions: [],
    versions: [
      {
        id: 'v1',
        version: 1,
        party: 'buyer',
        change_summary: null,
        is_signed: false,
        hasDocx: true,
        hasPdf: false,
        redline: null,
        comments: [],
        review: {
          requests: [
            {
              id: 'q1',
              requestedBy: 'Olive Owner',
              requestedAt: '2026-10-12T15:00:00Z',
            },
          ],
          decisions: [
            {
              id: 'd2',
              decision: 'changes_needed' as const,
              note: 'Cap the indemnity',
              decidedAt: '2026-10-14T15:00:00Z',
              withoutCounsel: false,
            },
            {
              id: 'd1',
              decision: 'approved' as const,
              note: null,
              decidedAt: '2026-10-13T15:00:00Z',
              withoutCounsel: true,
            },
          ],
        },
      },
      {
        id: 'v2',
        version: 2,
        party: 'seller',
        change_summary: 'Seller redline',
        is_signed: true,
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
            author: { name: 'Olive Owner', role: 'team' as const },
            side: 'buyer' as const,
            quotedText: null,
            body: 'Price is firm',
            internal: false,
            resolved: false,
            replies: [],
          },
        ],
        review: { requests: [], decisions: [] },
      },
    ],
  },
];

describe('ContractList', () => {
  it('lists each contract with its versions, which side wrote them, and their files', () => {
    const markup = renderToStaticMarkup(
      <ContractList dealId={'d1'}
            filesPath={'/counsel/d1/contracts/files'}
            redlineUpload contracts={contracts} viewer={null} decide={null} />,
    );

    expect(markup).toContain('APA');
    expect(rows(markup)).toEqual([
      ['1', 'Buyer', '', '', 'WordPDF conversion failedRetry PDF'],
      ['2', 'Seller', 'Seller redline', 'Signed', 'WordPDF'],
    ]);
    expect(
      [...parse(markup).querySelectorAll('a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      '/counsel/d1/contracts/files/v1/docx',
      '/counsel/d1/contracts/files/v2/docx',
      '/counsel/d1/contracts/files/v2/pdf',
    ]);
  });

  describe('LOI extensions', () => {
    const noReview = { requests: [], decisions: [] };
    const extensionVersion = (id: string, changes: object = {}) => ({
      id,
      version: 1,
      party: 'buyer',
      change_summary: null,
      is_signed: false,
      hasDocx: true,
      hasPdf: true,
      redline: null,
      comments: [],
      review: noReview,
      ...changes,
    });
    const loi = {
      id: 'loi-1',
      type: 'loi',
      versions: [extensionVersion('lv1', { is_signed: true, hasDocx: false })],
      extensions: [
        {
          id: 'e1',
          extends_to: '2026-12-15',
          note: null,
          noted_on: null,
          state: 'draft' as const,
          versions: [extensionVersion('ev1')],
        },
        {
          id: 'e2',
          extends_to: '2027-01-15',
          note: 'Seller agreed by email to thirty more days',
          noted_on: '2026-11-20',
          state: 'noted' as const,
          versions: [],
        },
        {
          id: 'e3',
          extends_to: '2027-02-15',
          note: null,
          noted_on: '2026-12-01',
          state: 'signed' as const,
          versions: [extensionVersion('ev3', { is_signed: true })],
        },
      ],
    };
    const render = (decide: (() => Promise<{ ok: true }>) | null) =>
      parse(
        renderToStaticMarkup(
          <ContractList
            dealId={'d1'}
            filesPath={'/counsel/d1/contracts/files'}
            redlineUpload
            contracts={[loi]}
            viewer={{ side: 'buyer' }}
            decide={decide}
          />,
        ),
      );
    const items = (document: Document) => [
      ...document.querySelectorAll('[data-extension]'),
    ];

    it('lists each extension under its LOI with its end date, state, note, signed copy, and versions', () => {
      const document = render(null);

      expect(
        [...document.querySelectorAll('[data-slot="card-title"]')].map(
          (title) => title.textContent,
        ),
      ).toEqual(['LOI']);
      expect(
        items(document).map((item) => [
          item.querySelector('h4')?.textContent,
          item.querySelector('[data-slot="badge"]')?.textContent,
          item.querySelector('[data-extension-noted]')?.textContent ?? null,
          [...item.querySelectorAll('[data-extension-actions] a')].map(
            (link) => link.getAttribute('href'),
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
          'Noted',
          'Agreed on Nov 20, 2026: Seller agreed by email to thirty more days',
          [],
          [],
        ],
        [
          'LOI extension to Feb 15, 2027',
          'Signed',
          'Agreed on Dec 1, 2026',
          ['/counsel/d1/contracts/files/ev3/pdf'],
          [['1', 'Buyer', '', 'Signed', 'WordPDF']],
        ],
      ]);
    });

    it('gives counsel on each extension version the sign-off, comments, and redline upload an LOI version has', () => {
      const [draft, noted] = items(render(async () => ({ ok: true })));

      expect(
        [...draft!.querySelectorAll('[data-version-review] button')].map(
          (button) => button.textContent,
        ),
      ).toEqual(['Approve', 'Approve with comments', 'Changes needed']);
      expect(
        draft!.querySelector('[data-version-comments] [data-new-comment]'),
      ).not.toBeNull();
      expect(
        [...draft!.querySelectorAll('tr[id], section[id]')].map(
          (element) => element.id,
        ),
      ).toEqual(['contract-version-ev1', 'contract-review-ev1']);
      expect(draft!.querySelector('input[type="file"]')).not.toBeNull();
      expect(noted!.querySelector('table')).toBeNull();
      expect(noted!.querySelector('input[type="file"]')).toBeNull();
    });
  });

  it('shows what each version changed from the one before', () => {
    const document = parse(
      renderToStaticMarkup(
        <ContractList dealId={'d1'}
            filesPath={'/counsel/d1/contracts/files'}
            redlineUpload contracts={contracts} viewer={null} decide={null} />,
      ),
    );

    expect(
      [...document.querySelectorAll('del')].map((d) => d.textContent),
    ).toEqual(['2.1M']);
    expect(
      [...document.querySelectorAll('ins')].map((i) => i.textContent),
    ).toEqual(['2.4M']);
  });

  it('offers a redline upload on each contract', () => {
    const document = parse(
      renderToStaticMarkup(
        <ContractList dealId={'d1'}
            filesPath={'/counsel/d1/contracts/files'}
            redlineUpload contracts={contracts} viewer={null} decide={null} />,
      ),
    );

    expect(
      [...document.querySelectorAll('button')]
        .map((button) => button.textContent)
        .filter((name) => name === 'Choose redline (.docx)'),
    ).toHaveLength(1);
  });

  it('tells counsel what comes next and lets them message the deal team when nothing has been shared', () => {
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(<ContractList dealId={'d1'}
            filesPath={'/counsel/d1/contracts/files'}
            redlineUpload contracts={[]} viewer={null} decide={null} />),
      'text/html',
    );

    expect(document.body.textContent).toContain(
      "When the deal team shares the LOI or APA you'll get an email and can upload redlines here.",
    );
    expect(
      document
        .querySelector('a[href="/counsel/d1/messages"]')
        ?.textContent,
    ).toBe('Message the deal team');
  });

  it('keeps the plain empty note where no redlines are uploaded', () => {
    expect(
      renderToStaticMarkup(<ContractList dealId={'d1'}
            filesPath={'/seller/rooms/r1/contracts/files'}
            redlineUpload={false} contracts={[]} viewer={null} decide={null} />),
    ).toContain('No contracts have been shared with you yet.');
  });

  it("shows each version's comments under the number this viewer knows it by", () => {
    const comments = (viewer: { side: 'buyer' | 'seller' } | null) =>
      [
        ...parse(
          renderToStaticMarkup(
            <ContractList dealId={'d1'}
            filesPath={'/counsel/d1/contracts/files'}
            redlineUpload contracts={contracts} viewer={viewer} decide={null} />,
          ),
        ).querySelectorAll('[data-version-comments]'),
      ].map((section) => [
        section.querySelector('h3')?.textContent,
        [...section.querySelectorAll('[data-body]')].map((b) => b.textContent),
        section.querySelector('[data-new-comment]') !== null,
      ]);

    expect(comments({ side: 'seller' })).toEqual([
      ['Comments on version 1', [], true],
      ['Comments on version 2', ['Price is firm'], true],
    ]);
    expect(comments(null).map(([, , form]) => form)).toEqual([false, false]);
  });

  it('offers no redline upload where the viewer cannot upload one', () => {
    const document = parse(
      renderToStaticMarkup(
        <ContractList
          dealId={'d1'}
          filesPath={'/seller/rooms/r1/contracts/files'}
          redlineUpload={false}
          contracts={contracts}
          viewer={{ side: 'seller' }}
          decide={null}
        />,
      ),
    );

    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(rows(document.body.innerHTML)[0]).toEqual([
      '1',
      'Buyer',
      '',
      '',
      'WordPDF conversion failed',
    ]);
    expect(
      [...document.querySelectorAll('a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual([
      '/seller/rooms/r1/contracts/files/v1/docx',
      '/seller/rooms/r1/contracts/files/v2/docx',
      '/seller/rooms/r1/contracts/files/v2/pdf',
    ]);
  });

  it("shows each version's review requests and this side's answers, latest first", () => {
    const reviews = [
      ...parse(
        renderToStaticMarkup(
          <ContractList dealId={'d1'}
            filesPath={'/counsel/d1/contracts/files'}
            redlineUpload contracts={contracts} viewer={null} decide={null} />,
        ),
      ).querySelectorAll('[data-version-review]'),
    ].map((section) => ({
      heading: section.querySelector('h3')?.textContent,
      requests: [...section.querySelectorAll('[data-review-request]')].map(
        (request) => request.textContent,
      ),
      answers: [...section.querySelectorAll('[data-review-decision]')].map(
        (decision) => decision.textContent,
      ),
    }));

    expect(reviews).toEqual([
      {
        heading: 'Sign-off on version 1',
        requests: ['Review requested by Olive Owner on Oct 12, 2026'],
        answers: [
          'Changes needed on Oct 14, 2026: Cap the indemnity',
          'Approved on Oct 13, 2026, confirmed without counsel',
        ],
      },
      { heading: 'Sign-off on version 2', requests: [], answers: [] },
    ]);
  });

  it('offers the three answers on each version only to a viewer who may give them', () => {
    const choices = (decide: (() => Promise<{ ok: true }>) | null) =>
      [
        ...parse(
          renderToStaticMarkup(
            <ContractList dealId={'d1'}
              filesPath={'/counsel/d1/contracts/files'}
              redlineUpload contracts={contracts} viewer={null} decide={decide} />,
          ),
        ).querySelectorAll('[data-version-review]'),
      ].map((section) =>
        [...section.querySelectorAll('button')].map((b) => b.textContent),
      );

    expect(choices(async () => ({ ok: true }))).toEqual([
      ['Approve', 'Approve with comments', 'Changes needed'],
      ['Approve', 'Approve with comments', 'Changes needed'],
    ]);
    expect(choices(null)).toEqual([[], []]);
  });

  it('points counsel asking for changes to the redline upload only where there is one', () => {
    const hint = (redlineUpload: boolean) =>
      renderToStaticMarkup(
        <ContractList dealId={'d1'}
          filesPath={'/counsel/d1/contracts/files'}
          redlineUpload={redlineUpload} contracts={contracts} viewer={null}
          decide={async () => ({ ok: true })} />,
      ).includes('You can also upload a redline below.');

    expect(hint(true)).toBe(true);
    expect(hint(false)).toBe(false);
  });
});
