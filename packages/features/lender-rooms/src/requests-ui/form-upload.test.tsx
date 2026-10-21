// @vitest-environment jsdom
import './test-support/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SendingRequests, SendingRows } from './ask-composer';
import { FormUpload } from './form-upload';
import { fakeRoom } from './test-support/fake-room';
import {
  alerts,
  announced,
  attach,
  button,
  choose,
  clearScreen,
  dialogText,
  field,
  fields,
  pageText,
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

      await attach('Choose the forms', fileName);

      expect(fields('Sign it electronically')).toHaveLength(1);
    },
  );

  it('does not offer signing electronically for a spreadsheet, and says which files allow it', async () => {
    await openDialog();

    await attach('Choose the forms', 'rates.xlsx');

    expect(fields('Sign it electronically')).toEqual([]);
    expect(dialogText()).toContain('Upload a PDF or Word file to use e-sign');
  });

  it('offers signing electronically when any chosen file can be signed, even if the first cannot', async () => {
    await openDialog();

    await attach('Choose the forms', 'rates.xlsx', 'application.pdf');

    expect(fields('Sign it electronically')).toHaveLength(1);
    expect(dialogText()).not.toContain(
      'Upload a PDF or Word file to use e-sign',
    );
  });

  it('sends a file that cannot be signed back as a completed file when e-sign is chosen for several', async () => {
    await openDialog();

    await attach('Choose the forms', 'rates.xlsx', 'application.pdf');
    await choose('Sign it electronically');
    await press('Send form');

    expect(fakeRoom.forms).toMatchObject([
      { title: 'rates', returnRoute: 'upload' },
      { title: 'application', returnRoute: 'esign' },
    ]);
  });

  it('cannot be sent before a file is chosen', async () => {
    await openDialog();

    expect(button('Send form').disabled).toBe(true);
  });

  it('sends the form with its title, note, and chosen route', async () => {
    await openDialog();

    await attach('Choose the forms', 'application.pdf');
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

  it('takes the title from the file name until the lender types one', async () => {
    await openDialog();

    await attach('Choose the forms', 'SBA Form 1919.pdf');

    expect(field('Title').value).toBe('SBA Form 1919');

    await type('Title', 'Owner form');

    expect(field('Title').value).toBe('Owner form');
  });

  it('sends one form per file, each titled from its own file name', async () => {
    await openDialog(false);

    await attach('Choose the forms', 'SBA Form 1919.pdf', 'Rate sheet.xlsx');
    await press('Send form');

    expect(fakeRoom.forms).toMatchObject([
      {
        title: 'SBA Form 1919',
        documentId: 'document:upload:SBA Form 1919.pdf',
      },
      {
        title: 'Rate sheet',
        documentId: 'document:upload:Rate sheet.xlsx',
      },
    ]);
    expect(dialogText()).toBeNull();
  });

  it('warns before sending a form already sent, and sends it when the lender sends again', async () => {
    fakeRoom.sentFormTitles = { 'application.pdf': 'Borrower application' };
    await openDialog();

    await attach('Choose the forms', 'application.pdf');
    await press('Send form');

    expect(alerts()).toEqual([
      'You already sent application.pdf as "Borrower application". Send form again to send it anyway.',
    ]);
    expect(fakeRoom.forms).toEqual([]);

    await press('Send form');

    expect(fakeRoom.forms).toHaveLength(1);
  });

  it('adds the file to the room only when the form is sent', async () => {
    await openDialog();

    await attach('Choose the forms', 'application.pdf');

    expect(fakeRoom.registered).toEqual([]);
  });

  it('keeps a zipped form as one file', async () => {
    await openDialog();

    await attach('Choose the forms', 'forms.zip');
    await type('Title', 'Form pack');
    await press('Send form');

    expect(fakeRoom.registered).toEqual([
      { uploadId: 'upload:forms.zip', keepAsZip: true },
    ]);
  });

  it('falls back to a completed file when the chosen file is swapped for one that cannot be signed', async () => {
    await openDialog();

    await attach('Choose the forms', 'application.pdf');
    await choose('Sign it electronically');
    await press('Remove application.pdf');
    await attach('Choose the forms', 'rates.xlsx');
    await type('Title', 'Rate sheet');
    await press('Send form');

    expect(fakeRoom.forms).toMatchObject([{ returnRoute: 'upload' }]);
    expect(fakeRoom.cancelled).toEqual(['upload:application.pdf']);
  });

  it('asks before discarding, then cancels the waiting file', async () => {
    await openDialog();

    await attach('Choose the forms', 'application.pdf');
    await press('Cancel');

    expect(dialogText()).toContain('Discard this request?');

    await press('Discard');
    await settle();

    expect(dialogText()).toBeNull();
    expect(fakeRoom.cancelled).toEqual(['upload:application.pdf']);
  });
});

describe('a form on its way', () => {
  it('shows the form in the list at once as sending, then says who it was sent to', async () => {
    fakeRoom.holdSending();
    show(
      <SendingRequests sentTo={'Morgan Reyes'}>
        <FormUpload
          roomId={ROOM}
          privateFolderId={FOLDER}
          dealName={null}
          esignAvailable={false}
        />
        <SendingRows
          kind={'form'}
          shownIds={[]}
          emptyMessage={'No forms yet.'}
        />
      </SendingRequests>,
    );
    await press('Upload a form');
    await attach('Choose the forms', 'application.pdf');
    await press('Send form');
    await settle();

    expect(pageText()).not.toContain('No forms yet.');
    expect(pageText()).toContain('applicationSending');

    fakeRoom.releaseSending();
    await settle();

    expect(announced()).toContain('Sent to Morgan Reyes');
  });
});

describe('uploading a form when e-signature is not set up', () => {
  it('shows no choice of how the form is returned, even for a PDF', async () => {
    await openDialog(false);

    await attach('Choose the forms', 'application.pdf');

    expect(dialogText()).not.toContain('return this form');
    expect(fields('Sign it electronically')).toEqual([]);
    expect(fields('Fill it in and upload it')).toEqual([]);
    expect(dialogText()).not.toContain('e-sign');
  });

  it('sends the form to come back as a completed file', async () => {
    await openDialog(false);

    await attach('Choose the forms', 'application.pdf');
    await type('Title', 'Borrower application');
    await press('Send form');

    expect(fakeRoom.forms).toMatchObject([{ returnRoute: 'upload' }]);
  });
});
