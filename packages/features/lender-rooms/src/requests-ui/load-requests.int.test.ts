import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type Person,
  admin,
  provisionPerson,
  removeEverythingSeeded,
  seedTeamDeal,
  seedRoom,
} from '../asks/integration-harness';
import { loadLatestSignature, loadRequests } from './load-requests';

describe('loading a form page as a lender', () => {
  let lender: Person;
  let outsider: Person;
  let formId: string;
  let untouchedFormId: string;
  let sentFormId: string;
  let cancelledFormId: string;
  let roomId: string;

  async function seedForm(roomId: string, accountId: string, title: string) {
    const { data: form } = await admin
      .from('lender_ask')
      .insert({
        room_id: roomId,
        account_id: accountId,
        kind: 'form',
        title,
        return_route: 'esign',
        created_by: lender.userId,
      })
      .select('id')
      .single()
      .throwOnError();

    return form.id;
  }

  beforeAll(async () => {
    const owner = await provisionPerson();
    lender = await provisionPerson();
    outsider = await provisionPerson();

    const deal = await seedTeamDeal(owner);
    ({ roomId } = await seedRoom(deal, 'First Harbor Bank', [lender]));

    formId = await seedForm(roomId, deal.accountId, 'Borrower application');
    untouchedFormId = await seedForm(roomId, deal.accountId, 'Rate lock');

    sentFormId = await seedForm(roomId, deal.accountId, 'Guaranty');
    cancelledFormId = await seedForm(roomId, deal.accountId, 'Estoppel');

    await admin
      .from('lender_form_signature')
      .insert([
        {
          ask_id: sentFormId,
          documenso_document_id: 'envelope-3',
          signers: [],
          status: 'declined',
          created_at: '2026-10-10T09:00:00Z',
        },
        {
          ask_id: sentFormId,
          documenso_document_id: 'envelope-4',
          signers: [],
          status: 'sent',
          created_at: '2026-10-11T09:00:00Z',
        },
        {
          ask_id: cancelledFormId,
          documenso_document_id: 'envelope-5',
          signers: [],
          status: 'sent',
          created_at: '2026-10-10T09:00:00Z',
        },
        {
          ask_id: cancelledFormId,
          documenso_document_id: 'envelope-6',
          signers: [],
          status: 'cancelled',
          created_at: '2026-10-11T09:00:00Z',
        },
      ])
      .throwOnError();

    await admin
      .from('lender_form_signature')
      .insert([
        {
          ask_id: formId,
          documenso_document_id: 'envelope-1',
          signers: [],
          status: 'declined',
          created_at: '2026-10-10T09:00:00Z',
        },
        {
          ask_id: formId,
          documenso_document_id: 'envelope-2',
          signers: [],
          status: 'draft',
          created_at: '2026-10-11T09:00:00Z',
        },
      ])
      .throwOnError();
  });

  afterAll(removeEverythingSeeded);

  it('shows a room member the newest signature status of the form', async () => {
    expect(await loadLatestSignature(lender.client, formId)).toMatchObject({
      status: 'draft',
    });
  });

  it('shows nothing for a form that was never sent for signature', async () => {
    expect(
      await loadLatestSignature(lender.client, untouchedFormId),
    ).toBeUndefined();
  });

  it('shows nothing to someone outside the room', async () => {
    expect(await loadLatestSignature(outsider.client, formId)).toBeUndefined();
  });

  it('lists each form for a room member with its latest signature status', async () => {
    const { forms } = await loadRequests(lender.client, roomId);

    expect(
      Object.fromEntries(
        forms.map((form) => [form.id, form.latest_signature_status]),
      ),
    ).toEqual({
      [formId]: 'draft',
      [untouchedFormId]: null,
      [sentFormId]: 'sent',
      [cancelledFormId]: null,
    });
  });
});
