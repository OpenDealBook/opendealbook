// @vitest-environment jsdom
import { act } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThreadEntry } from '@odb/lender-rooms/requests-ui/thread.ts';

import { LenderRequestInbox } from './lender-request-inbox';
import { LenderRequestThread } from './lender-request-thread';
import {
  alerts,
  attach,
  buttonNames,
  clearScreen,
  dialogText,
  fields,
  links,
  linkTo,
  pageText,
  press,
  fakeServer,
  settle,
  show,
  type,
} from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/asks/internal-actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'replyToAskAsInternal',
    'closeAskAsInternal',
    'promoteAskFile',
  ),
);
vi.mock('@odb/lender-rooms/forms/internal-actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'returnCompletedForm',
    'replyToFormAsInternal',
    'closeFormAsInternal',
  ),
);
vi.mock('@odb/lender-rooms/esign/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'requestFormSignature',
    'checkFormSignature',
    'cancelFormSignature',
  ),
);
vi.mock('@odb/lender-rooms/uploads/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'beginUpload',
    'registerUpload',
    'cancelUpload',
  ),
);
vi.mock('@odb/seller-rooms/questions/actions.ts', async () =>
  (await import('./lender-test-kit')).fakeActions(
    'askSeller',
    'askSellerAboutLenderAsk',
  ),
);
vi.mock('@odb/lender-rooms/faq/publish.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('saveNewFaqEntry'),
);
vi.mock('@odb/lender-rooms/faq/manage.ts', async () =>
  (await import('./lender-test-kit')).fakeActions('findSimilarFaqEntries'),
);
vi.mock(
  '@odb/supabase/client',
  async () =>
    (await import('@odb/lender-rooms/requests-ui/test-support/fake-room.ts'))
      .browserClient,
);

vi.mock(
  '@odb/lender-rooms/viewer/file-viewer.tsx',
  async () => (await import('./lender-test-kit')).fakeViewer,
);

const ROOM = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const ROOM_PATH = `/home/team-one/deals/deal-1/lenders/${ROOM}`;
const ASK = 'ask-1';
const FORM = 'form-1';

const row = (
  id: string,
  title: string,
  status: 'open' | 'answered' | 'closed' | 'withdrawn',
  at: string,
) => ({
  id,
  title,
  status,
  last_activity_at: at,
  return_route: null,
  latest_signature_status: null,
});

const lenderMessage: ThreadEntry = {
  kind: 'message',
  key: 'opening',
  side: 'lender',
  authorName: 'ana',
  at: '2026-10-12T10:00:00.000Z',
  body: 'Please share the rent roll.',
};

const ourFiles: ThreadEntry = {
  kind: 'files',
  key: 'file-1',
  side: 'internal',
  authorName: null,
  at: '2026-10-12T11:00:00.000Z',
  files: [
    {
      isAvailable: true,
      documentId: 'doc-rent-roll',
      name: 'Rent roll.pdf',
      role: 'fulfilment',
      label: null,
    },
  ],
};

const blankForm: ThreadEntry = {
  kind: 'files',
  key: 'file-2',
  side: 'lender',
  authorName: 'ana',
  at: '2026-10-12T10:00:00.000Z',
  files: [
    {
      isAvailable: true,
      documentId: 'doc-blank',
      name: 'Personal financial statement.pdf',
      role: 'blank_form',
      label: 'Form to complete',
    },
  ],
};

const packageFolders = [
  { id: 'master', path: 'Lender package' },
  { id: 'financials', path: 'Lender package / Financials' },
];

const faq = {
  dealId: 'deal-1',
  faqPath: '/home/team-one/deals/deal-1/lenders/faq',
  prefill: {
    question: 'Please share the rent roll.',
    answer: 'Here it is.',
    files: [{ askFileId: 'ask-file-1', name: 'Rent roll.pdf' }],
  },
};

function showAsk(
  status: 'open' | 'answered' | 'closed' = 'open',
  addToFaq: typeof faq | null = null,
) {
  show(
    <LenderRequestThread
      roomId={ROOM}
      privateFolderId={'own'}
      request={{ kind: 'ask', id: ASK, status, return_route: null }}
      thread={[lenderMessage, ourFiles]}
      fulfilmentFileIds={{ 'doc-rent-roll': 'ask-file-1' }}
      packageFolders={packageFolders}
      signatures={[]}
      faq={addToFaq}
    />,
  );
}

function showForm(
  returnRoute: 'upload' | 'esign',
  signatures: Parameters<typeof LenderRequestThread>[0]['signatures'] = [],
) {
  show(
    <LenderRequestThread
      roomId={ROOM}
      privateFolderId={'own'}
      request={{
        kind: 'form',
        id: FORM,
        status: 'open',
        return_route: returnRoute,
      }}
      thread={[blankForm]}
      fulfilmentFileIds={{}}
      packageFolders={packageFolders}
      signatures={signatures}
      faq={null}
    />,
  );
}

async function pickFolder(label: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  )!;

  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  fakeServer.reset();
  fakeServer.values.beginUpload = {
    uploadId: 'upload-1',
    path: 'p',
    token: 't',
  };
  fakeServer.values.registerUpload = ['doc-new'];
});

afterEach(clearScreen);

describe('the requests inbox for a room', () => {
  it('lists requests waiting on us first and links each to its thread', () => {
    show(
      <LenderRequestInbox
        roomPath={ROOM_PATH}
        asks={[
          row(
            'ask-answered',
            'Insurance certificate',
            'answered',
            '2026-10-13T10:00:00.000Z',
          ),
          row('ask-open', 'Rent roll', 'open', '2026-10-12T10:00:00.000Z'),
        ]}
        forms={[
          {
            ...row('form-sent', 'PFS', 'open', '2026-10-14T10:00:00.000Z'),
            return_route: 'esign',
            latest_signature_status: 'sent',
            completed_document_ids: [],
          },
          {
            ...row(
              'form-draft',
              'Guaranty',
              'open',
              '2026-10-11T10:00:00.000Z',
            ),
            return_route: 'esign',
            latest_signature_status: 'draft',
            completed_document_ids: [],
          },
          {
            ...row('form-done', 'W-9', 'answered', '2026-10-10T10:00:00.000Z'),
            return_route: 'upload',
            latest_signature_status: null,
            completed_document_ids: ['doc-w9'],
          },
        ]}
      />,
    );

    expect(links().map((link) => link.href)).toEqual([
      `${ROOM_PATH}/requests/asks/ask-open`,
      `${ROOM_PATH}/requests/forms/form-draft`,
      `${ROOM_PATH}/requests/forms/form-sent`,
      `${ROOM_PATH}/requests/asks/ask-answered`,
      `${ROOM_PATH}/requests/forms/form-done`,
    ]);

    const rows = [...document.querySelectorAll('li')].map((each) =>
      (each.textContent ?? '').replace(/\s+/g, ' '),
    );

    expect(rows[0]).toContain('Rent roll');
    expect(rows[0]).toContain('Waiting on us');
    expect(rows[1]).toContain('Form');
    expect(rows[1]).toContain('Waiting on us');
    expect(rows[1]).toContain('Draft in Documenso');
    expect(rows[2]).toContain('Out for signature');
    expect(rows[2]).not.toContain('Waiting on us');
    expect(rows[3]).toContain('Waiting on the lender');
    expect(rows[4]).toContain('Completed file returned');
  });

  it('says so when the lender has asked for nothing', () => {
    show(<LenderRequestInbox roomPath={ROOM_PATH} asks={[]} forms={[]} />);

    expect(pageText()).toContain('This lender has not sent any requests yet');
  });
});

describe('a request thread', () => {
  it('shows both sides of the thread with downloadable files', () => {
    showAsk();

    expect(pageText()).toContain('ana');
    expect(pageText()).toContain('Please share the rent roll.');
    expect(pageText()).toContain('Deal team');
    expect(linkTo('Download Rent roll.pdf')).toBe(
      `/lender/${ROOM}/files/doc-rent-roll?disposition=download`,
    );
  });

  it('opens a thread file in the tracked in-browser preview', async () => {
    showAsk();

    await press('Rent roll.pdf');

    expect(dialogText()).toContain(
      `Viewer showing Rent roll.pdf from /lender/${ROOM}/files/doc-rent-roll?disposition=preview`,
    );
  });

  it('replies with a message and files that fulfil the request', async () => {
    showAsk();

    await type('Reply', 'Here it is.');
    await attach('Attach files', 'rent-roll-2026.pdf');
    await settle();
    await press('Send reply');
    await settle();

    expect(fakeServer.inputsTo('beginUpload')).toMatchObject([
      { roomId: ROOM, folderId: 'own', name: 'rent-roll-2026.pdf' },
    ]);
    expect(fakeServer.inputsTo('replyToAskAsInternal')).toEqual([
      { askId: ASK, body: 'Here it is.', documentIds: ['doc-new'] },
    ]);
    expect(fakeServer.refreshes).toBeGreaterThan(0);
  });

  it('closes the request', async () => {
    showAsk();

    await press('Close request');

    expect(fakeServer.inputsTo('closeAskAsInternal')).toEqual([{ askId: ASK }]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('does not offer to close a request that is already closed', () => {
    showAsk('closed');

    expect(buttonNames()).not.toContain('Close request');
  });

  it('adds a fulfilment file to the lender package folder the team picks', async () => {
    showAsk();

    await pickFolder('Lender package folder for Rent roll.pdf', 'financials');
    await press('Add Rent roll.pdf to lender package');

    expect(fakeServer.inputsTo('promoteAskFile')).toEqual([
      { askFileId: 'ask-file-1', folderId: 'financials' },
    ]);
    expect(pageText()).toContain('Rent roll.pdf is now in the lender package');
  });

  it('offers to add an answered ask to the FAQ, filled in from the thread', async () => {
    showAsk('answered', faq);

    await press('Add to FAQ');

    expect(dialogText()).toContain('Add to the FAQ');
    expect(fields('Question')[0]?.value).toBe('Please share the rent roll.');
  });

  it('does not offer the FAQ for an ask that is not answered', () => {
    showAsk('open');

    expect(buttonNames()).not.toContain('Add to FAQ');
  });

  it('shows a refusal as given', async () => {
    fakeServer.refusal = 'Only the deal team can do that';
    showAsk();

    await press('Close request');

    expect(alerts()).toEqual(['Only the deal team can do that']);
  });
});

describe('a lender form', () => {
  it('offers the blank form and returns a completed file', async () => {
    showForm('upload');

    expect(linkTo('Download Personal financial statement.pdf')).toBe(
      `/lender/${ROOM}/files/doc-blank?disposition=download`,
    );

    await attach('Choose completed form', 'pfs-completed.pdf');
    await settle();
    await settle();
    await press('Return completed form');

    expect(fakeServer.inputsTo('returnCompletedForm')).toEqual([
      { formId: FORM, documentIds: ['doc-new'] },
    ]);
    expect(buttonNames()).not.toContain('Request signature');
  });

  it('requests a signature for the named signers', async () => {
    fakeServer.values.requestFormSignature = {
      editorUrl: 'https://documenso.test/documents/77/edit',
    };
    showForm('esign');

    await type('Signer 1 name', 'Jordan Reyes');
    await type('Signer 1 email', 'jordan@buyer.test');
    await press('Add signer');
    await type('Signer 2 name', 'Pat Partner');
    await type('Signer 2 email', 'pat@buyer.com');
    await press('Request signature');

    expect(fakeServer.inputsTo('requestFormSignature')).toEqual([
      {
        formId: FORM,
        signers: [
          { name: 'Jordan Reyes', email: 'jordan@buyer.test' },
          { name: 'Pat Partner', email: 'pat@buyer.com' },
        ],
      },
    ]);
    expect(fakeServer.refreshes).toBe(1);
    expect(pageText()).not.toMatch(/\bwe (will )?send\b|sent for signature/i);
  });

  it('removes a signer row', async () => {
    showForm('esign');

    await press('Add signer');
    expect(fields('Signer 2 name')).toHaveLength(1);

    await press('Remove signer 2');
    expect(fields('Signer 2 name')).toHaveLength(0);
    expect(buttonNames()).not.toContain('Remove signer 1');
  });

  it('shows the current signature status and checks it on request', async () => {
    fakeServer.values.checkFormSignature = { status: 'completed' };
    showForm('esign', [
      {
        id: 'signature-1',
        status: 'draft',
        created_at: '2026-10-12T12:00:00.000Z',
        signer_names: ['Jordan Reyes'],
        editor_url: 'https://documenso.test/documents/77/edit',
      },
    ]);

    expect(pageText()).toContain('Draft in Documenso');
    expect(pageText()).toContain('Jordan Reyes');
    expect(linkTo('Open in Documenso to place signature fields')).toBe(
      'https://documenso.test/documents/77/edit',
    );
    expect(buttonNames()).not.toContain('Request signature');

    await press('Check status');

    expect(fakeServer.inputsTo('checkFormSignature')).toEqual([
      { signatureId: 'signature-1' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows what the signature request refusal says', async () => {
    fakeServer.refusal = 'whatever the server says';
    showForm('esign');

    await type('Signer 1 name', 'Jordan Reyes');
    await type('Signer 1 email', 'jordan@buyer.test');
    await press('Request signature');

    expect(alerts()).toEqual(['whatever the server says']);
  });

  const draft = {
    id: 'signature-1',
    status: 'draft' as const,
    created_at: '2026-10-12T12:00:00.000Z',
    signer_names: ['Jordan Reyes'],
    editor_url: 'https://documenso.test/documents/77/edit',
  };

  it('cancels a draft signature request only after the team confirms', async () => {
    showForm('esign', [draft]);

    await press('Cancel signature request');

    expect(dialogText()).toContain('Cancel this signature request?');
    expect(fakeServer.inputsTo('cancelFormSignature')).toEqual([]);

    await press('Yes, cancel it');

    expect(fakeServer.inputsTo('cancelFormSignature')).toEqual([
      { signatureId: 'signature-1' },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows why a draft could not be cancelled', async () => {
    fakeServer.refusal = 'whatever the server says';
    showForm('esign', [draft]);

    await press('Cancel signature request');
    await press('Yes, cancel it');

    expect(alerts()).toEqual(['whatever the server says']);
    expect(fakeServer.refreshes).toBe(0);
  });

  it('does not offer to cancel once the request is out for signature', () => {
    showForm('esign', [{ ...draft, status: 'sent', editor_url: null }]);

    expect(pageText()).toContain('Out for signature');
    expect(buttonNames()).not.toContain('Cancel signature request');
  });

  it('shows a request the team cancelled as cancelled and offers a new one', () => {
    showForm('esign', [
      {
        id: 'signature-1',
        status: 'cancelled',
        created_at: '2026-10-12T12:00:00.000Z',
        signer_names: ['Jordan Reyes'],
        editor_url: null,
      },
    ]);

    expect(pageText()).toContain('Cancelled');
    expect(pageText()).not.toContain('declined');
    expect(buttonNames()).toContain('Request signature');
    expect(buttonNames()).not.toContain('Check status');
  });

  it('lets the team request again after a signer declined', () => {
    showForm('esign', [
      {
        id: 'signature-1',
        status: 'declined',
        created_at: '2026-10-12T12:00:00.000Z',
        signer_names: ['Jordan Reyes'],
        editor_url: null,
      },
    ]);

    expect(pageText()).toContain('A signer declined');
    expect(buttonNames()).toContain('Request signature');
  });
});
