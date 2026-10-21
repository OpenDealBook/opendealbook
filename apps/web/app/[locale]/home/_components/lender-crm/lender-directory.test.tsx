// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  choose,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  press,
  show,
  type,
} from '../lender-test-kit';
import { LenderDirectory } from './lender-directory';
import type { SavedLender } from './saved-lender';

vi.mock(
  'next/navigation',
  async () => (await import('../lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/crm/lenders/actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions(
    'addLender',
    'editLender',
    'deleteLender',
    'addLenderContact',
    'editLenderContact',
    'deleteLenderContact',
    'setPrimaryLenderContact',
  ),
);

const TEAM = '2c1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

function lender(overrides: Partial<SavedLender>): SavedLender {
  return {
    id: crypto.randomUUID(),
    name: 'Unnamed',
    website: 'example.com',
    rate_type: null,
    typical_rate: null,
    max_loan: null,
    sba_preferred: false,
    industries: [],
    states: [],
    tags: [],
    notes: null,
    lender_contact: [],
    ...overrides,
  };
}

const firstBank = lender({
  id: '3d1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
  name: 'First Bank',
  website: 'firstbank.com',
  rate_type: 'fixed',
  typical_rate: 7.25,
  max_loan: 5_000_000,
  sba_preferred: true,
  tags: ['sba', 'local'],
  lender_contact: [
    {
      id: '4e1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
      name: 'Jane Banker',
      email: 'jane@firstbank.com',
      phone: null,
      is_primary: false,
    },
  ],
});
const riverCredit = lender({
  name: 'River Credit',
  rate_type: 'variable',
  max_loan: 1_000_000,
  tags: ['local'],
});
const summit = lender({ name: 'Summit Capital', rate_type: 'either' });

function showDirectory(lenders = [firstBank, riverCredit, summit]) {
  show(
    <LenderDirectory
      accountId={TEAM}
      teamPath={'/home/team-one'}
      lenders={lenders}
      histories={Object.fromEntries(lenders.map((saved) => [saved.id, []]))}
    />,
  );
}

function listed() {
  return [
    ...document.querySelectorAll('[aria-label="Saved lenders"] > li h3'),
  ].map((heading) => heading.textContent);
}

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('filtering saved lenders', () => {
  it('shows every lender until a filter is chosen', () => {
    showDirectory();

    expect(listed()).toEqual(['First Bank', 'River Credit', 'Summit Capital']);
  });

  it('keeps only lenders with the chosen tag', async () => {
    showDirectory();

    await press('sba');

    expect(listed()).toEqual(['First Bank']);
  });

  it('keeps lenders in any of the chosen industries and lenders with no industries saved', async () => {
    showDirectory([
      lender({ name: 'Plant Bank', industries: ['Manufacturing'] }),
      lender({ name: 'Care Credit', industries: ['Healthcare', 'Dental'] }),
      lender({ name: 'Shop Loans', industries: ['Retail'] }),
      lender({ name: 'Blank Bank' }),
    ]);

    await press('Manufacturing');
    await press('Dental');

    expect(listed()).toEqual(['Plant Bank', 'Care Credit', 'Blank Bank']);
  });

  it('keeps lenders in any of the chosen states and lenders with no states saved', async () => {
    showDirectory([
      lender({ name: 'Texas Bank', states: ['TX'] }),
      lender({ name: 'Plains Credit', states: ['OK', 'KS'] }),
      lender({ name: 'Coast Loans', states: ['CA'] }),
      lender({ name: 'Blank Bank' }),
    ]);

    await press('TX');
    await press('KS');

    expect(listed()).toEqual(['Texas Bank', 'Plains Credit', 'Blank Bank']);
  });

  it('keeps lenders with any of several chosen tags', async () => {
    showDirectory([
      firstBank,
      riverCredit,
      summit,
      lender({ name: 'Delta Loans', tags: ['sba'] }),
    ]);

    await press('sba');
    await press('local');

    expect(listed()).toEqual(['First Bank', 'River Credit', 'Delta Loans']);
  });

  it('keeps lenders with the chosen rate type and lenders that offer either', async () => {
    showDirectory();

    await press('Variable');

    expect(listed()).toEqual(['River Credit', 'Summit Capital']);
  });

  it('keeps only lenders that offer either when that is chosen', async () => {
    showDirectory();

    await press('Fixed or variable');

    expect(listed()).toEqual(['Summit Capital']);
  });

  it('keeps only lenders that prefer SBA loans when asked', async () => {
    showDirectory();

    await choose('Only lenders that prefer SBA');

    expect(listed()).toEqual(['First Bank']);
  });

  it('keeps lenders whose largest loan covers the amount and lenders with no largest loan saved', async () => {
    showDirectory();

    await type('Loan size ($)', '2000000');

    expect(listed()).toEqual(['First Bank', 'Summit Capital']);
  });

  it('combines filters and says when nothing matches', async () => {
    showDirectory();

    await press('local');
    await press('Fixed or variable');

    expect(listed()).toEqual([]);
    expect(document.body.textContent).toContain(
      'No saved lenders match these filters.',
    );
  });
});

describe('adding and editing a lender', () => {
  it('saves a new lender with its terms, splitting comma lists and leaving blanks empty', async () => {
    showDirectory();

    await press('Add lender');
    await type('Lender name', 'Harbor Bank');
    await type('Website', 'harborbank.com');
    await choose('Fixed');
    await type('Typical rate (%)', '7.25');
    await type('Largest loan ($)', '5000000');
    await choose('Prefers SBA loans');
    await type('Tags', 'sba, local ,');
    await press('Save lender');

    expect(fakeServer.inputsTo('addLender')).toEqual([
      {
        accountId: TEAM,
        name: 'Harbor Bank',
        website: 'harborbank.com',
        rateType: 'fixed',
        typicalRate: 7.25,
        maxLoan: 5_000_000,
        sbaPreferred: true,
        industries: [],
        states: [],
        tags: ['sba', 'local'],
        notes: null,
      },
    ]);
    expect(fakeServer.refreshes).toBe(1);
    expect(dialogText()).toBeNull();
  });

  it('keeps the form open and shows why when the server refuses', async () => {
    fakeServer.refusalFor.addLender =
      'This team already saved a lender with that website';
    showDirectory();

    await press('Add lender');
    await type('Lender name', 'First Bank again');
    await type('Website', 'firstbank.com');
    await press('Save lender');

    expect(alerts()).toEqual([
      'This team already saved a lender with that website',
    ]);
    expect(dialogText()).toContain('Add a lender');
    expect(fakeServer.refreshes).toBe(0);
  });

  it('opens an edit with the saved terms and clears a term emptied by hand', async () => {
    showDirectory();

    await press('Edit First Bank');

    expect(field('Typical rate (%)').value).toBe('7.25');
    expect(field('Tags').value).toBe('sba, local');

    await type('Typical rate (%)', '');
    await press('Save lender');

    expect(fakeServer.inputsTo('editLender')).toEqual([
      expect.objectContaining({
        lenderId: firstBank.id,
        name: 'First Bank',
        typicalRate: null,
        maxLoan: 5_000_000,
        tags: ['sba', 'local'],
      }),
    ]);
  });
});

describe("a lender's contacts", () => {
  it('makes a contact the primary', async () => {
    showDirectory();

    await press('Make Jane Banker primary');

    expect(fakeServer.inputsTo('setPrimaryLenderContact')).toEqual([
      { contactId: firstBank.lender_contact[0]!.id },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows why a contact cannot become primary', async () => {
    fakeServer.refusalFor.setPrimaryLenderContact =
      'Add an email before making this the primary contact';
    showDirectory();

    await press('Make Jane Banker primary');

    expect(alerts()).toEqual([
      'Add an email before making this the primary contact',
    ]);
  });

  it('adds a contact, leaving a blank email and phone out', async () => {
    showDirectory([firstBank]);

    await press('Add contact to First Bank');
    await type('Contact name', 'Sam Lender');
    await press('Save contact');

    expect(fakeServer.inputsTo('addLenderContact')).toEqual([
      { lenderId: firstBank.id, name: 'Sam Lender' },
    ]);
  });

  it('clears an emptied email when editing a contact', async () => {
    showDirectory([firstBank]);

    await press('Edit Jane Banker');
    await type('Email', '');
    await press('Save contact');

    expect(fakeServer.inputsTo('editLenderContact')).toEqual([
      {
        contactId: firstBank.lender_contact[0]!.id,
        name: 'Jane Banker',
        email: null,
        phone: null,
      },
    ]);
  });
});

describe('deleting', () => {
  it('asks before deleting a lender and deletes only once confirmed', async () => {
    showDirectory([firstBank]);

    await press('Delete First Bank');

    expect(dialogText()).toContain('Delete First Bank?');
    expect(fakeServer.inputsTo('deleteLender')).toEqual([]);

    await press('Delete lender');

    expect(fakeServer.inputsTo('deleteLender')).toEqual([
      { lenderId: firstBank.id },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('keeps the lender when the delete is cancelled', async () => {
    showDirectory([firstBank]);

    await press('Delete First Bank');
    await press('Cancel');

    expect(dialogText()).toBeNull();
    expect(fakeServer.inputsTo('deleteLender')).toEqual([]);
  });

  it('asks before deleting a contact and deletes only once confirmed', async () => {
    showDirectory([firstBank]);

    await press('Delete Jane Banker');

    expect(dialogText()).toContain('Delete Jane Banker?');
    expect(fakeServer.inputsTo('deleteLenderContact')).toEqual([]);

    await press('Delete contact');

    expect(fakeServer.inputsTo('deleteLenderContact')).toEqual([
      { contactId: firstBank.lender_contact[0]!.id },
    ]);
  });

  it('shows a refused delete in the dialog', async () => {
    fakeServer.refusalFor.deleteLender = 'Only the deal team can do that';
    showDirectory([firstBank]);

    await press('Delete First Bank');
    await press('Delete lender');

    expect(alerts()).toEqual(['Only the deal team can do that']);
    expect(dialogText()).toContain('Delete First Bank?');
  });
});
