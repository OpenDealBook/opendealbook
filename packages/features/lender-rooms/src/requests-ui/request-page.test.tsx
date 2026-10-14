// @vitest-environment jsdom
import './test-support/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestPage } from './request-page';
import { RequestsPage } from './requests-page';
import {
  buttonNames,
  buttons,
  clearScreen,
  fields,
  pageText,
  show,
} from './test-support/screen';

const room = {
  id: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
  deal_id: '11111111-1111-4111-8111-111111111111',
  name: 'First Harbor Bank',
  welcome_note: null,
  expires_at: null,
  is_open: true,
  private_folder_id: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22',
  master_folder_id: null,
  brand_name: null,
  brand_logo_path: null,
  deal_name: 'Harbor Freight Co',
  deal_description: null,
};

const request = {
  id: 'ask-1',
  room_id: room.id,
  account_id: 'account',
  kind: 'ask' as const,
  title: 'Rent roll',
  body: 'As of September',
  status: 'open' as const,
  return_route: null,
  first_response_at: null,
  created_by: 'lender',
  created_at: '2026-10-01T09:00:00.000Z',
};

const row = {
  ...request,
  last_activity_at: request.created_at,
  latest_signature_status: null,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(clearScreen);

describe('the requests page', () => {
  it('lets a room member send a request and upload a form', () => {
    show(
      <RequestsPage
        room={room}
        asks={[row]}
        forms={[]}
        canAct
        esignAvailable
      />,
    );

    expect(buttons('Send request')).toHaveLength(1);
    expect(buttons('Upload a form')).toHaveLength(1);
    expect(pageText()).not.toContain('You are viewing this room');
  });

  it('shows a manager who is not a member the list with a banner and nothing to send', () => {
    show(
      <RequestsPage
        room={room}
        asks={[row]}
        forms={[]}
        canAct={false}
        esignAvailable
      />,
    );

    expect(pageText()).toContain(
      'You are viewing this room as First Harbor Bank sees it.',
    );
    expect(pageText()).toContain('Rent roll');
    expect(buttonNames()).toEqual([]);
    expect(fields("What do you need from Harbor Freight Co's team?")).toEqual(
      [],
    );
  });

  it("says there are no requests yet in the lender's words", () => {
    show(
      <RequestsPage room={room} asks={[]} forms={[]} canAct esignAvailable />,
    );

    expect(pageText()).toContain('No requests yet.');
    expect(pageText()).toContain(
      "Upload one of your own forms for Harbor Freight Co's team to complete.",
    );
  });

  it("shows an answered request as the lender's turn", () => {
    show(
      <RequestsPage
        room={room}
        asks={[{ ...row, status: 'answered' }]}
        forms={[]}
        canAct
        esignAvailable
      />,
    );

    expect(pageText()).toContain('Answered, your turn');
  });
});

describe('a form that has been sent to its signers', () => {
  const sentForm = {
    ...row,
    id: 'form-1',
    kind: 'form' as const,
    title: 'Borrower application',
    return_route: 'esign' as const,
    latest_signature_status: 'sent' as const,
    current_blank_form: undefined,
    completed_document_ids: [],
    signed_document_ids: [],
  };

  it('reads Out for signature in the list instead of waiting on the team', () => {
    show(
      <RequestsPage
        room={room}
        asks={[]}
        forms={[sentForm]}
        canAct
        esignAvailable
      />,
    );

    expect(pageText()).toContain('Out for signature');
    expect(pageText()).not.toContain('Waiting on');
  });

  it('reads Out for signature on its own page', () => {
    show(
      <RequestPage
        room={room}
        request={sentForm}
        thread={[]}
        signatureStatus={'sent'}
        canAct
        esignAvailable
      />,
    );

    expect(pageText().split('Out for signature')).toHaveLength(2);
    expect(pageText()).not.toContain('Sent for signature');
    expect(pageText()).not.toContain('Waiting on');
  });

  it('still waits on the team while the signature request is a draft', () => {
    show(
      <RequestsPage
        room={room}
        asks={[]}
        forms={[{ ...sentForm, latest_signature_status: 'draft' }]}
        canAct
        esignAvailable
      />,
    );

    expect(pageText()).toContain("Waiting on Harbor Freight Co's team");
  });
});

describe('a request page', () => {
  it('offers a member the actions and the reply box', () => {
    show(
      <RequestPage
        room={room}
        request={request}
        thread={[]}
        canAct
        esignAvailable
      />,
    );

    expect(buttons('Withdraw')).toHaveLength(1);
    expect(fields('Reply')).toHaveLength(1);
  });

  it('shows a manager who is not a member the thread read-only with a banner', () => {
    show(
      <RequestPage
        room={room}
        request={request}
        thread={[]}
        canAct={false}
        esignAvailable
      />,
    );

    expect(pageText()).toContain(
      'You are viewing this room as First Harbor Bank sees it.',
    );
    expect(buttonNames()).toEqual([]);
    expect(fields('Reply')).toEqual([]);
  });

  it('says who returns a form and how', () => {
    show(
      <RequestPage
        room={room}
        request={{ ...request, kind: 'form', return_route: 'esign' }}
        thread={[]}
        canAct
        esignAvailable
      />,
    );

    expect(pageText()).toContain(
      "Harbor Freight Co's team will sign it electronically",
    );
  });

  it('tells the lender a form is being prepared for signature while its newest signature request is a draft', () => {
    show(
      <RequestPage
        room={room}
        request={{ ...request, kind: 'form', return_route: 'esign' }}
        thread={[]}
        signatureStatus={'draft'}
        canAct
        esignAvailable
      />,
    );

    expect(pageText()).toContain('Being prepared for signature');
  });

  it('still shows an earlier e-sign form in full when e-signature is no longer set up', () => {
    show(
      <RequestPage
        room={room}
        request={{ ...request, kind: 'form', return_route: 'esign' }}
        thread={[]}
        signatureStatus={'sent'}
        canAct
        esignAvailable={false}
      />,
    );

    expect(pageText()).toContain(
      "Harbor Freight Co's team will sign it electronically",
    );
    expect(pageText()).toContain('Out for signature');
    expect(buttons('Replace file')).toHaveLength(1);
  });

  it('shows a form whose signature request was cancelled exactly as one never sent for signature', () => {
    const esignForm = {
      ...request,
      kind: 'form' as const,
      return_route: 'esign' as const,
    };

    show(
      <RequestPage
        room={room}
        request={esignForm}
        thread={[]}
        canAct
        esignAvailable
      />,
    );
    const neverSent = pageText();
    clearScreen();

    show(
      <RequestPage
        room={room}
        request={esignForm}
        thread={[]}
        signatureStatus={'cancelled'}
        canAct
        esignAvailable
      />,
    );

    expect(pageText()).toBe(neverSent);
    expect(document.querySelectorAll('main header span:empty')).toHaveLength(0);
  });
});
