// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentCitation } from '@odb/ai/citations';

import messages from '../../../../messages/en.json';
import {
  alerts,
  buttonNames,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  linkTo,
  pageText,
  press,
  show,
  type,
} from './lender-test-kit';
import { PromoteToFaqDialog } from './promote-to-faq-dialog';

vi.mock('next/navigation', async () => ({
  ...(await import('./lender-test-kit')).navigation,
  useParams: () => ({ account: 'acme' }),
}));
vi.mock('@odb/lender-rooms/faq/publish.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('saveNewFaqEntry'),
);
vi.mock('@odb/lender-rooms/faq/manage.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('findSimilarFaqEntries'),
);

const PROMOTE_MESSAGES = {
  open: 'Add to lender FAQ',
  title: 'Add to the lender FAQ',
  description:
    'This saves a draft. Lenders see it only once it is published. Data room sources are left out.',
  question: 'Question',
  answer: 'Answer',
  save: 'Save draft',
  saved: 'Saved to the lender FAQ as a draft.',
  failed: 'The draft was not saved. Try again.',
  viewFaq: 'Open the lender FAQ',
  similar:
    'The FAQ already has entries like this one. Save again to add yours anyway.',
  notManager: 'Only deal managers can add to the lender FAQ.',
  tooLong: 'A question or answer can be at most 5,000 characters.',
  bothRequired: 'A question and an answer are both required.',
};

const DEAL = '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

const CIM: DocumentCitation = {
  documentId: 'doc-cim',
  documentName: 'cim.pdf',
  version: 2,
  pageFrom: 4,
  pageTo: 5,
};
const MODEL: DocumentCitation = {
  documentId: 'doc-model',
  documentName: 'model.xlsx',
  version: 1,
  sheet: 'P&L',
  cellRange: 'B2:B9',
};

function showPromote(question: string, answer: string) {
  show(
    <NextIntlClientProvider
      locale={'en'}
      messages={{
        ...messages,
        dealAsk: { ...messages.dealAsk, promote: PROMOTE_MESSAGES },
      }}
      timeZone={'UTC'}
    >
      <PromoteToFaqDialog
        dealId={DEAL}
        question={question}
        answer={answer}
        citations={[CIM, MODEL]}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  fakeServer.reset();
  fakeServer.values.findSimilarFaqEntries = [];
});

afterEach(clearScreen);

describe('promoting an AI answer to the lender FAQ', () => {
  it('opens with the question and the answer stripped of its source labels', async () => {
    showPromote(
      'What was revenue?',
      'Revenue was $2M [cim.pdf v2, p. 4-5].\n\nMargins held [model.xlsx v1, P&L!B2:B9] [cim.pdf v2, p. 4-5].',
    );

    await press('Add to lender FAQ');

    expect(field('Question').value).toBe('What was revenue?');
    expect(field('Answer').value).toBe('Revenue was $2M.\n\nMargins held.');
  });

  it('opens with the answer converted from markdown to plain text', async () => {
    showPromote(
      'What was revenue?',
      [
        '## Summary',
        '',
        'Revenue was **$2M** and *growing* per `FY25` [cim.pdf v2, p. 4-5].',
        '',
        '- First point',
        '- Second point',
        '',
        '* Starred point',
        '',
        'See [the filing](https://example.com/filing).',
        '',
        '| Year | Revenue |',
        '| --- | --- |',
        '| 2024 | $1.8M |',
        '| 2025 | $2M |',
      ].join('\n'),
    );

    await press('Add to lender FAQ');

    expect(field('Answer').value).toBe(
      [
        'Summary',
        '',
        'Revenue was $2M and growing per FY25.',
        '',
        '- First point',
        '- Second point',
        '',
        '- Starred point',
        '',
        'See the filing (https://example.com/filing).',
        '',
        'Year | Revenue',
        '2024 | $1.8M',
        '2025 | $2M',
      ].join('\n'),
    );
  });

  it('keeps list numbers, indents nested items, keeps code and resolves escapes', async () => {
    showPromote(
      'What are the steps?',
      [
        '1. First',
        '2. Second',
        '   - Nested *note*',
        '',
        'Price is 5 \\* 2 \\[approx\\].',
        '',
        '```',
        'total = a * b',
        '```',
      ].join('\n'),
    );

    await press('Add to lender FAQ');

    expect(field('Answer').value).toBe(
      [
        '1. First',
        '2. Second',
        '  - Nested note',
        '',
        'Price is 5 * 2 [approx].',
        '',
        'total = a * b',
      ].join('\n'),
    );
  });

  it('trims the question and answer to 5,000 characters', async () => {
    showPromote('q'.repeat(5001), `${'a'.repeat(5001)} [cim.pdf v2, p. 4-5]`);

    await press('Add to lender FAQ');

    expect(field('Question').value).toBe('q'.repeat(5000));
    expect(field('Answer').value).toBe('a'.repeat(5000));
  });

  it('saves the edited wording as a draft entry with no lender request', async () => {
    showPromote('What was revenue?', 'Revenue was $2M [cim.pdf v2, p. 4-5].');

    await press('Add to lender FAQ');
    await type('Question', 'What was 2025 revenue?');
    await type('Answer', 'Revenue was about $2M.');
    await press('Save draft');

    expect(fakeServer.inputsTo('saveNewFaqEntry')).toEqual([
      {
        entryId: expect.any(String),
        dealId: DEAL,
        askIds: [],
        question: 'What was 2025 revenue?',
        answer: 'Revenue was about $2M.',
        status: 'draft',
        files: [],
      },
    ]);
    expect(dialogText()).toBeNull();
    expect(buttonNames()).not.toContain('Add to lender FAQ');
    expect(pageText()).toContain('Saved to the lender FAQ as a draft.');
    expect(linkTo('Open the lender FAQ')).toBe(
      `/home/acme/deals/${DEAL}/lenders/faq`,
    );
  });

  it('lists similar FAQ entries and saves only when asked again', async () => {
    fakeServer.values.findSimilarFaqEntries = [
      { id: 'entry-1', question: 'What was revenue last year?' },
    ];
    showPromote('What was revenue?', 'Revenue was $2M.');

    await press('Add to lender FAQ');
    await press('Save draft');

    expect(fakeServer.inputsTo('findSimilarFaqEntries')).toEqual([
      { dealId: DEAL, query: 'What was revenue?' },
    ]);
    expect(fakeServer.inputsTo('saveNewFaqEntry')).toEqual([]);
    expect(dialogText()).toContain(PROMOTE_MESSAGES.similar);
    expect(dialogText()).toContain('What was revenue last year?');

    await press('Save draft');

    expect(fakeServer.inputsTo('saveNewFaqEntry')).toHaveLength(1);
    expect(pageText()).toContain('Saved to the lender FAQ as a draft.');
  });

  it.each([
    ['Only the deal team can do that', PROMOTE_MESSAGES.notManager],
    [
      'A question or answer can be at most 5,000 characters',
      PROMOTE_MESSAGES.tooLong,
    ],
    [
      'A question and an answer are both required',
      PROMOTE_MESSAGES.bothRequired,
    ],
    [
      'This team is read-only until billing is updated.',
      messages.dealAsk.readOnly,
    ],
    [
      'Your session has ended. Sign in again.',
      messages.dealAsk.errors.signedOut,
    ],
    ['Something new from the server', PROMOTE_MESSAGES.failed],
  ])(
    'keeps the edits open and translates the refusal %j',
    async (refusal, shown) => {
      fakeServer.refusalFor.saveNewFaqEntry = refusal;
      showPromote('What was revenue?', 'Revenue was $2M.');

      await press('Add to lender FAQ');
      await type('Question', 'What was 2025 revenue?');
      await press('Save draft');

      expect(alerts()).toEqual([shown]);
      expect(field('Question').value).toBe('What was 2025 revenue?');
    },
  );

  it('translates a refused similar-entries check', async () => {
    fakeServer.refusalFor.findSimilarFaqEntries =
      'Your session has ended. Sign in again.';
    showPromote('What was revenue?', 'Revenue was $2M.');

    await press('Add to lender FAQ');
    await press('Save draft');

    expect(alerts()).toEqual([messages.dealAsk.errors.signedOut]);
    expect(fakeServer.inputsTo('saveNewFaqEntry')).toEqual([]);
  });

  it('keeps the dialog open with a retry message when saving crashes', async () => {
    fakeServer.crashing = ['saveNewFaqEntry'];
    showPromote('What was revenue?', 'Revenue was $2M.');

    await press('Add to lender FAQ');
    await press('Save draft');

    expect(alerts()).toEqual([PROMOTE_MESSAGES.failed]);
    expect(field('Question').value).toBe('What was revenue?');
  });
});
