// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LenderFaqAdd } from './lender-faq-add';
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

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/faq/publish.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('saveNewFaqEntry'),
);
vi.mock('@odb/lender-rooms/faq/manage.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('findSimilarFaqEntries'),
);

const DEAL = '1b0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const ASK = '9a0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const FAQ_PATH = `/home/team-one/deals/${DEAL}/lenders/faq`;

function showAdd() {
  show(
    <LenderFaqAdd
      dealId={DEAL}
      askId={ASK}
      faqPath={FAQ_PATH}
      prefill={{
        question: 'Rent roll\n\nPlease share the rent roll.',
        answer: 'Attached is the current rent roll.',
        files: [
          { askFileId: 'ask-file-1', name: 'Rent roll.pdf' },
          { askFileId: 'ask-file-2', name: 'T12.xlsx' },
        ],
      }}
    />,
  );
}

beforeEach(() => {
  fakeServer.reset();
  fakeServer.values.findSimilarFaqEntries = [];
});

afterEach(clearScreen);

describe('adding an answered ask to the FAQ', () => {
  it('opens with the question, our answer, and our answer files filled in', async () => {
    showAdd();

    await press('Add to FAQ');

    expect(field('Question').value).toBe(
      'Rent roll\n\nPlease share the rent roll.',
    );
    expect(field('Answer').value).toBe('Attached is the current rent roll.');
    expect(field('Name for Rent roll.pdf').value).toBe('Rent roll.pdf');
    expect(field('Name for T12.xlsx').value).toBe('T12.xlsx');
  });

  it('saves a draft with the edited wording and only the files chosen, under their new names', async () => {
    showAdd();

    await press('Add to FAQ');
    await type('Question', 'Can we see the rent roll?');
    await type('Answer', 'Yes, the rent roll is attached.');
    await type('Name for Rent roll.pdf', 'Rent roll 2026.pdf');
    await press('Include T12.xlsx');
    await press('Save draft');

    expect(fakeServer.inputsTo('saveNewFaqEntry')).toEqual([
      {
        entryId: expect.any(String),
        dealId: DEAL,
        askIds: [ASK],
        question: 'Can we see the rent roll?',
        answer: 'Yes, the rent roll is attached.',
        status: 'draft',
        files: [{ askFileId: 'ask-file-1', name: 'Rent roll 2026.pdf' }],
      },
    ]);
    expect(dialogText()).toBeNull();
    expect(buttonNames()).not.toContain('Add to FAQ');
    expect(pageText()).toContain('Saved to the FAQ as a draft.');
    expect(linkTo('Manage the FAQ')).toBe(FAQ_PATH);
  });

  it('publishes the entry', async () => {
    showAdd();

    await press('Add to FAQ');
    await press('Publish');

    expect(fakeServer.inputsTo('saveNewFaqEntry')).toMatchObject([
      { status: 'published' },
    ]);
    expect(pageText()).toContain('Published to the FAQ.');
  });

  it('warns about similar entries already in the FAQ and adds it only when asked again', async () => {
    fakeServer.values.findSimilarFaqEntries = [
      { id: 'entry-1', question: 'Where is the rent roll?' },
    ];
    showAdd();

    await press('Add to FAQ');
    await press('Publish');

    expect(fakeServer.inputsTo('findSimilarFaqEntries')).toEqual([
      { dealId: DEAL, query: 'Rent roll\n\nPlease share the rent roll.' },
    ]);
    expect(fakeServer.inputsTo('saveNewFaqEntry')).toEqual([]);
    expect(dialogText()).toContain('Where is the rent roll?');

    await press('Publish');

    expect(fakeServer.inputsTo('saveNewFaqEntry')).toMatchObject([
      { status: 'published' },
    ]);
  });

  it('checks again for similar entries once the question changes', async () => {
    fakeServer.values.findSimilarFaqEntries = [
      { id: 'entry-1', question: 'Where is the rent roll?' },
    ];
    showAdd();

    await press('Add to FAQ');
    await press('Save draft');
    await type('Question', 'Where is the T12?');
    await press('Save draft');

    expect(fakeServer.inputsTo('findSimilarFaqEntries')).toHaveLength(2);
    expect(fakeServer.inputsTo('saveNewFaqEntry')).toEqual([]);
  });

  it('leaves a blank question to the save, which says what is wrong', async () => {
    fakeServer.refusalFor.saveNewFaqEntry =
      'A question and an answer are both required';
    showAdd();

    await press('Add to FAQ');
    await type('Question', '');
    await press('Save draft');

    expect(fakeServer.inputsTo('findSimilarFaqEntries')).toEqual([]);
    expect(alerts()).toEqual(['A question and an answer are both required']);
  });

  it('shows a refusal as given and keeps the dialog open', async () => {
    fakeServer.refusalFor.saveNewFaqEntry =
      'A question or answer can be at most 5,000 characters';
    showAdd();

    await press('Add to FAQ');
    await press('Publish');

    expect(alerts()).toEqual([
      'A question or answer can be at most 5,000 characters',
    ]);
    expect(dialogText()).toContain('Question');
  });
});
