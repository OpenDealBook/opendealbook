// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  alerts,
  attach,
  buttons,
  choose,
  clearScreen,
  dialogText,
  fakeServer,
  fields,
  press,
  show,
  submit,
  type,
} from './lender-test-kit';
import {
  ChangeExtensionEndDate,
  ExtendExclusivity,
  NoteLoiExtension,
} from './loi-extension-dialogs';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/deals/server', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'createLoiExtensionFromTemplate',
    'createNotedLoiExtension',
    'recordLoiExtensionSignedElsewhere',
    'noteLoiExtension',
    'rescheduleLoiExtension',
  ),
);

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

async function startExtension() {
  show(<ExtendExclusivity dealId={'deal-1'} loiId={'loi-1'} />);
  await press('Extend exclusivity');
  await type('New end date', '2026-12-15');
}

describe('extending exclusivity on a signed LOI', () => {
  it('generates the extension from the template', async () => {
    await startExtension();
    await choose('Generate from the template');
    await submit('New end date');

    expect(fakeServer.inputsTo('createLoiExtensionFromTemplate')).toEqual([
      { deal_id: 'deal-1', loi_id: 'loi-1', extends_to: '2026-12-15' },
    ]);
    expect(dialogText()).toBeNull();
    expect(fakeServer.refreshes).toBe(1);
  });

  it('records an extension signed outside the platform from its signed copy', async () => {
    await startExtension();
    await choose('Upload the signed copy');
    expect(buttons('Extend exclusivity').at(-1)!.disabled).toBe(true);
    await attach('Signed copy', 'Extension signed.pdf');
    await type('Signing date', '2026-11-24');
    await choose('Seller');
    await submit('New end date');

    expect(fakeServer.inputsTo('recordLoiExtensionSignedElsewhere')).toEqual([
      {
        deal_id: 'deal-1',
        loi_id: 'loi-1',
        extends_to: '2026-12-15',
        party: 'seller',
        signed_on: '2026-11-24',
        file: expect.objectContaining({ name: 'Extension signed.pdf' }),
      },
    ]);
    expect(dialogText()).toBeNull();
  });

  it('notes an extension agreed by email with what was agreed and when', async () => {
    await startExtension();
    await choose('Note as agreed by email');
    await type('What was agreed', 'Seller agreed by email to thirty more days');
    await type('Agreed on', '2026-11-20');
    await submit('New end date');

    expect(fakeServer.inputsTo('createNotedLoiExtension')).toEqual([
      {
        deal_id: 'deal-1',
        loi_id: 'loi-1',
        extends_to: '2026-12-15',
        note: 'Seller agreed by email to thirty more days',
        noted_on: '2026-11-20',
      },
    ]);
    expect(dialogText()).toBeNull();
  });

  it('asks only for what the chosen way needs', async () => {
    await startExtension();

    expect(fields('Signed copy')).toHaveLength(0);
    expect(fields('What was agreed')).toHaveLength(0);

    await choose('Upload the signed copy');
    expect(fields('Signed copy')).toHaveLength(1);
    expect(fields('What was agreed')).toHaveLength(0);

    await choose('Note as agreed by email');
    expect(fields('Signed copy')).toHaveLength(0);
    expect(fields('What was agreed')).toHaveLength(1);
  });

  it('starts over when the dialog is closed and opened again', async () => {
    await startExtension();
    await choose('Upload the signed copy');
    await attach('Signed copy', 'Extension signed.pdf');
    await press('Cancel');
    await press('Extend exclusivity');

    expect(fields('Signed copy')).toHaveLength(0);
    await choose('Upload the signed copy');
    expect(buttons('Extend exclusivity').at(-1)!.disabled).toBe(true);
  });

  it('says why when the extension is refused and keeps the dialog open', async () => {
    fakeServer.refusal = 'The new exclusivity end must be after 2026-12-01';
    await startExtension();
    await choose('Generate from the template');
    await submit('New end date');

    expect(alerts()).toEqual([
      'The new exclusivity end must be after 2026-12-01',
    ]);
    expect(dialogText()).toContain('Extend exclusivity');
    expect(fakeServer.refreshes).toBe(0);
  });
});

describe('a draft LOI extension', () => {
  it('moves its end date', async () => {
    show(
      <ChangeExtensionEndDate
        dealId={'deal-1'}
        extensionId={'extension-1'}
        extendsTo={'2026-12-15'}
      />,
    );
    await press('Change end date');
    await type('New end date', '2026-12-22');
    await submit('New end date');

    expect(fakeServer.inputsTo('rescheduleLoiExtension')).toEqual([
      {
        deal_id: 'deal-1',
        extension_id: 'extension-1',
        extends_to: '2026-12-22',
      },
    ]);
    expect(dialogText()).toBeNull();
    expect(fakeServer.refreshes).toBe(1);
  });

  it('is noted as agreed by email', async () => {
    show(<NoteLoiExtension dealId={'deal-1'} extensionId={'extension-1'} />);
    await press('Note as agreed');
    await type('What was agreed', 'Seller confirmed the new date by email');
    await type('Agreed on', '2026-11-21');
    await submit('Agreed on');

    expect(fakeServer.inputsTo('noteLoiExtension')).toEqual([
      {
        deal_id: 'deal-1',
        extension_id: 'extension-1',
        note: 'Seller confirmed the new date by email',
        noted_on: '2026-11-21',
      },
    ]);
    expect(dialogText()).toBeNull();
  });

  it('says why when noting is refused', async () => {
    fakeServer.refusal =
      'The day the extension was agreed cannot be in the future';
    show(<NoteLoiExtension dealId={'deal-1'} extensionId={'extension-1'} />);
    await press('Note as agreed');
    await type('What was agreed', 'Seller confirmed the new date by email');
    await type('Agreed on', '2026-12-30');
    await submit('Agreed on');

    expect(alerts()).toEqual([
      'The day the extension was agreed cannot be in the future',
    ]);
    expect(dialogText()).toContain('Note as agreed');
  });
});
