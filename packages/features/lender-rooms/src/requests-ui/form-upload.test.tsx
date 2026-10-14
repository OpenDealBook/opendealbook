// @vitest-environment jsdom
import './test-support/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormUpload } from './form-upload';
import { fakeRoom } from './test-support/fake-room';
import {
  attach,
  button,
  choose,
  clearScreen,
  dialogText,
  fields,
  press,
  settle,
  show,
  type,
} from './test-support/screen';

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const FOLDER = '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22';

async function openDialog(esignAvailable = true) {
  show(
    <FormUpload
      roomId={ROOM}
      privateFolderId={FOLDER}
      dealName={null}
      esignAvailable={esignAvailable}
    />,
  );
  await press('Upload a form');
}

beforeEach(() => {
  fakeRoom.reset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('uploading a form', () => {
  it("asks how the deal team should return it, in the lender's words", async () => {
    await openDialog();

    expect(dialogText()).toContain(
      'How should the deal team return this form?',
    );
    expect(fields('Fill it in and upload it')).toHaveLength(1);
  });

  it.each(['application.pdf', 'Application.DOCX'])(
    'offers signing electronically for %s',
    async (fileName) => {
      await openDialog();

      await attach('Choose the form', fileName);

      expect(fields('Sign it electronically')).toHaveLength(1);
    },
  );

  it('does not offer signing electronically for a spreadsheet, and says which files allow it', async () => {
    await openDialog();

    await attach('Choose the form', 'rates.xlsx');

    expect(fields('Sign it electronically')).toEqual([]);
    expect(dialogText()).toContain('Upload a PDF or Word file to use e-sign');
  });

  it('cannot be sent before a file is chosen', async () => {
    await openDialog();

    expect(button('Send form').disabled).toBe(true);
  });

  it('sends the form with its title, note, and chosen route', async () => {
    await openDialog();

    await attach('Choose the form', 'application.pdf');
    await type('Title', 'Borrower application');
    await type('Note (optional)', 'Sections 2 and 4');
    await choose('Sign it electronically');
    await press('Send form');

    expect(fakeRoom.forms).toEqual([
      {
        roomId: ROOM,
        title: 'Borrower application',
        note: 'Sections 2 and 4',
        documentId: 'document:upload:application.pdf',
        returnRoute: 'esign',
      },
    ]);
    expect(dialogText()).toBeNull();
  });

  it('adds the file to the room only when the form is sent', async () => {
    await openDialog();

    await attach('Choose the form', 'application.pdf');

    expect(fakeRoom.registered).toEqual([]);
  });

  it('keeps a zipped form as one file', async () => {
    await openDialog();

    await attach('Choose the form', 'forms.zip');
    await type('Title', 'Form pack');
    await press('Send form');

    expect(fakeRoom.registered).toEqual([
      { uploadId: 'upload:forms.zip', keepAsZip: true },
    ]);
  });

  it('falls back to a completed file when the chosen file is swapped for one that cannot be signed', async () => {
    await openDialog();

    await attach('Choose the form', 'application.pdf');
    await choose('Sign it electronically');
    await attach('Choose a different file', 'rates.xlsx');
    await type('Title', 'Rate sheet');
    await press('Send form');

    expect(fakeRoom.forms).toMatchObject([{ returnRoute: 'upload' }]);
    expect(fakeRoom.cancelled).toEqual(['upload:application.pdf']);
  });

  it('asks before discarding, then cancels the waiting file', async () => {
    await openDialog();

    await attach('Choose the form', 'application.pdf');
    await press('Cancel');

    expect(dialogText()).toContain('Discard this request?');

    await press('Discard');
    await settle();

    expect(dialogText()).toBeNull();
    expect(fakeRoom.cancelled).toEqual(['upload:application.pdf']);
  });
});

describe('uploading a form when e-signature is not set up', () => {
  it('shows no choice of how the form is returned, even for a PDF', async () => {
    await openDialog(false);

    await attach('Choose the form', 'application.pdf');

    expect(dialogText()).not.toContain('return this form');
    expect(fields('Sign it electronically')).toEqual([]);
    expect(fields('Fill it in and upload it')).toEqual([]);
    expect(dialogText()).not.toContain('e-sign');
  });

  it('sends the form to come back as a completed file', async () => {
    await openDialog(false);

    await attach('Choose the form', 'application.pdf');
    await type('Title', 'Borrower application');
    await press('Send form');

    expect(fakeRoom.forms).toMatchObject([{ returnRoute: 'upload' }]);
  });
});
