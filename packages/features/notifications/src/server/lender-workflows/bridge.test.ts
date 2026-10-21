import { describe, expect, it } from 'vitest';

import { createLenderBridge } from './bridge';
import type { VisibleDocument, VisibleFaqEntry } from './digest-content';

import { createHmac } from 'node:crypto';

const secretKey = 'test-novu-secret';
const siteUrl = 'https://opendealbook.app';
const bridgeUrl = `${siteUrl}/api/novu`;

const lenderPerson = '99999999-9999-4999-8999-999999999999';
const personWhoseLookupFails = '77777777-7777-4777-8777-777777777777';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const unreadableRoom = '12121212-1212-4121-8121-121212121212';
const unreadableAsk = '34343434-3434-4343-8343-343434343434';
const dealId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const askId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const formId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const balanceSheet = '11111111-1111-4111-8111-111111111111';
const taxReturn = '22222222-2222-4222-8222-222222222222';
const ebitdaEntry = '44444444-4444-4444-8444-444444444444';
const hiddenEntry = '55555555-5555-4555-8555-555555555555';

const rooms: Record<
  string,
  {
    name: string;
    dealName: string;
    outsideName: string;
    buyerTeam: string;
    dealId: string;
    teamAccountSlug: string;
  }
> = {
  [roomId]: {
    name: 'First Harbor Bank',
    dealName: 'Acme Tooling',
    outsideName: 'Project Atlas',
    buyerTeam: 'Acme Capital',
    dealId,
    teamAccountSlug: 'acme-capital',
  },
};

const teamRoomUrl = `${siteUrl}/home/acme-capital/deals/${dealId}/lenders/${roomId}`;

const requestTitles: Record<string, string> = {
  [`${roomId}/${askId}`]: 'Trailing twelve month financials',
  [`${roomId}/${formId}`]: 'Loan application',
};

const visibleByPerson: Record<string, VisibleDocument[]> = {
  [lenderPerson]: [
    {
      document_id: balanceSheet,
      name: 'Balance sheet.xlsx',
      folder_id: 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
      room_id: roomId,
      room_name: 'First Harbor Bank',
      outside_name: 'Project Atlas',
    },
    {
      document_id: taxReturn,
      name: 'Tax return 2025.pdf',
      folder_id: 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
      room_id: roomId,
      room_name: 'First Harbor Bank',
      outside_name: 'Project Atlas',
    },
  ],
};

const visibleFaqByPerson: Record<string, VisibleFaqEntry[]> = {
  [lenderPerson]: [
    {
      entry_id: ebitdaEntry,
      question: 'What was 2025 EBITDA?',
      room_id: roomId,
      room_name: 'First Harbor Bank',
      outside_name: 'Project Atlas',
    },
  ],
};

function found<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('not found');
  }

  return value;
}

const deps: Parameters<typeof createLenderBridge>[0] = {
  secretKey,
  siteUrl,
  digestIntervalMinutes: undefined,
  loadRoom: async ({ roomId }) => found(rooms[roomId]),
  loadRequestTitle: async ({ roomId, askId }) =>
    found(requestTitles[`${roomId}/${askId}`]),
  loadVisibleDocuments: async ({ userId, documentIds }) =>
    found(visibleByPerson[userId]).filter((document) =>
      documentIds.includes(document.document_id),
    ),
  loadVisibleFaqEntries: async ({ userId, entryIds }) =>
    found(visibleFaqByPerson[userId]).filter((entry) =>
      entryIds.includes(entry.entry_id),
    ),
  loadManagedSellerRooms: async () => [],
  loadSellerDigestItems: async () => [],
  loadCounselMessage: async () => {
    throw new Error('not used by lender workflows');
  },
  loadManagedCounselDeals: async () => [],
  loadSubmittedDealUpdate: async () => {
    throw new Error('not used by lender workflows');
  },
};

const bridge = createLenderBridge(deps);

function sign(body: unknown, key = secretKey, timestamp = Date.now()): string {
  const hmac = createHmac('sha256', key)
    .update(`${timestamp}.${JSON.stringify(body)}`)
    .digest('hex');

  return `t=${timestamp},v1=${hmac}`;
}

async function discover() {
  const response = await bridge(
    new Request(`${bridgeUrl}?action=discover`, {
      headers: { 'novu-signature': sign({}) },
    }),
  );

  return (await response.json()) as {
    workflows: {
      workflowId: string;
      steps: { stepId: string; type: string }[];
    }[];
  };
}

interface StepState {
  stepId: string;
  outputs: Record<string, unknown>;
  state: { status: string };
}

async function execute(input: {
  bridge?: typeof bridge;
  workflowId: string;
  stepId: string;
  payload: Record<string, unknown>;
  subscriber?: Record<string, unknown>;
  state?: StepState[];
}) {
  const body = {
    payload: input.payload,
    controls: {},
    state: input.state ?? [],
    subscriber: input.subscriber ?? { subscriberId: lenderPerson },
  };
  const response = await (input.bridge ?? bridge)(
    new Request(
      `${bridgeUrl}?action=execute&workflowId=${input.workflowId}&stepId=${input.stepId}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'novu-signature': sign(body),
        },
        body: JSON.stringify(body),
      },
    ),
  );

  return {
    status: response.status,
    result: (await response.json()) as {
      outputs: { subject?: string; body?: string } & Record<string, unknown>;
      options: { skip: boolean };
    },
  };
}

function textOf(html: string | undefined): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

function completed(
  stepId: string,
  outputs: Record<string, unknown>,
): StepState {
  return { stepId, outputs, state: { status: 'completed' } };
}

function digestOf(payloads: Record<string, unknown>[]) {
  return completed('daily-digest', {
    eventCount: payloads.length,
    events: payloads.map((payload, index) => ({
      id: `event-${index}`,
      time: '2026-10-13T12:00:00.000Z',
      payload: { roomId, dealId, ...payload },
    })),
  });
}

const askPayload = { roomId, askId, kind: 'ask' };
const formPayload = { roomId, askId: formId, kind: 'form' };

describe('lender bridge authentication', () => {
  it('refuses a call that carries no signature', async () => {
    const response = await bridge(
      new Request(
        `${bridgeUrl}?action=execute&workflowId=lender_ask.answered&stepId=email`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ payload: askPayload }),
        },
      ),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('/lender/');
  });

  it('refuses a call signed with a different secret', async () => {
    const body = { payload: askPayload };
    const response = await bridge(
      new Request(
        `${bridgeUrl}?action=execute&workflowId=lender_ask.answered&stepId=email`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'novu-signature': sign(body, 'some-other-secret'),
          },
          body: JSON.stringify(body),
        },
      ),
    );

    expect(response.status).toBe(401);
  });

  it('refuses a correctly signed call whose signature is over five minutes old', async () => {
    const response = await bridge(
      new Request(`${bridgeUrl}?action=discover`, {
        headers: {
          'novu-signature': sign({}, secretKey, Date.now() - 6 * 60 * 1000),
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('refuses to list the workflows without a signature', async () => {
    const response = await bridge(new Request(`${bridgeUrl}?action=discover`));

    expect(response.status).toBe(401);
  });

  it.each([bridgeUrl, `${bridgeUrl}?action=health-check`])(
    'answers an unsigned GET %s with status, versions and counts only',
    async (url) => {
      const response = await bridge(new Request(url));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: 'ok',
        sdkVersion: expect.any(String),
        frameworkVersion: expect.any(String),
        discovered: { workflows: 32, steps: 40 },
      });
    },
  );
});

describe('lender bridge without a Novu key', () => {
  it('refuses every call instead of failing to start', async () => {
    const unconfigured = createLenderBridge({
      secretKey: undefined,
      siteUrl,
      digestIntervalMinutes: undefined,
      loadRoom: async ({ roomId }) => found(rooms[roomId]),
      loadRequestTitle: async () => '',
      loadVisibleDocuments: async () => [],
      loadVisibleFaqEntries: async () => [],
      loadManagedSellerRooms: async () => [],
      loadSellerDigestItems: async () => [],
      loadCounselMessage: async () => {
        throw new Error('not used without a key');
      },
      loadManagedCounselDeals: async () => [],
      loadSubmittedDealUpdate: async () => {
        throw new Error('not used without a key');
      },
    });

    const response = await unconfigured(
      new Request(`${bridgeUrl}?action=discover`),
    );

    expect(response.status).toBe(401);
  });
});

describe('lender workflow definitions', () => {
  it("defines the twelve lender workflows, the two seller digests, the counsel message, the counsel uploads digest, the contract negotiation notice, the contract review reminder and unanswered notice, the deal update approval request, the three seller room notices, the five deal event notices, the to-do assignment, the Seller's counsel folder notice, the seller and counsel thread notice and the workflow run failure notice under the ids the triggers use", async () => {
    const { workflows } = await discover();

    expect(workflows.map((workflow) => workflow.workflowId).sort()).toEqual([
      'contract-negotiation',
      'contract-review.reminder',
      'contract-review.unanswered',
      'counsel-message',
      'counsel-uploads',
      'deal-update-submitted',
      'deal.apa_accepted',
      'deal.loi_accepted',
      'deal.offer_accepted',
      'deal.offer_submitted',
      'deal.resolved',
      'lender-nudges.daily',
      'lender-room-documents',
      'lender_ask.answered',
      'lender_ask.opened',
      'lender_ask.replied',
      'lender_form.returned',
      'lender_form.signature_completed',
      'lender_form.signature_declined',
      'lender_form.signature_expired',
      'lender_form.uploaded',
      'lender_room.access_requested',
      'lender_room.timeline_answered',
      'seller-counsel-folder.file-added',
      'seller-counsel-message.posted',
      'seller-room-activity',
      'seller-room-shared',
      'seller_room.access_requested',
      'seller_room.closed',
      'seller_room.reopened',
      'todo.assigned',
      'workflow-run.failed',
    ]);
  });

  it('gives every immediate workflow a single email step', async () => {
    const { workflows } = await discover();

    for (const workflow of workflows) {
      if (
        workflow.workflowId === 'lender-room-documents' ||
        workflow.workflowId === 'counsel-uploads' ||
        workflow.workflowId === 'seller-room-activity' ||
        workflow.workflowId === 'seller-room-shared'
      ) {
        continue;
      }

      expect(workflow.steps).toMatchObject([
        { stepId: 'email', type: 'email' },
      ]);
    }
  });

  it('digests new documents before looking them up and emailing', async () => {
    const { workflows } = await discover();
    const digest = workflows.find(
      (workflow) => workflow.workflowId === 'lender-room-documents',
    );

    expect(digest?.steps).toMatchObject([
      { stepId: 'daily-digest', type: 'digest' },
      { stepId: 'visible-documents', type: 'custom' },
      { stepId: 'email', type: 'email' },
    ]);
  });
});

describe('immediate emails to a lender', () => {
  it.each([
    {
      title: 'an answered request',
      workflowId: 'lender_ask.answered',
      payload: askPayload,
      subject: 'Acme Capital answered your request on Project Atlas',
      requestTitle: 'Trailing twelve month financials',
      link: `${siteUrl}/lender/${roomId}/requests/asks/${askId}`,
    },
    {
      title: 'a reply about a form',
      workflowId: 'lender_ask.answered',
      payload: formPayload,
      subject: 'Acme Capital replied about your form on Project Atlas',
      requestTitle: 'Loan application',
      link: `${siteUrl}/lender/${roomId}/requests/forms/${formId}`,
    },
    {
      title: 'a returned form',
      workflowId: 'lender_form.returned',
      payload: formPayload,
      subject: 'Acme Capital returned your form on Project Atlas',
      requestTitle: 'Loan application',
      link: `${siteUrl}/lender/${roomId}/requests/forms/${formId}`,
    },
  ])(
    '$workflowId names the deal, the room and the title for $title',
    async ({ workflowId, payload, subject, requestTitle, link }) => {
      const { status, result } = await execute({
        workflowId,
        stepId: 'email',
        payload,
      });
      const copy = textOf(result.outputs.body);

      expect(status).toBe(200);
      expect(result.outputs.subject).toBe(subject);
      expect(result.outputs.body?.split(requestTitle)).toHaveLength(2);
      expect(copy).toContain('Acme Capital has');
      expect(copy).toContain('First Harbor Bank');
      expect(copy).toContain(`"${requestTitle}"`);
      expect(result.outputs.body).toContain(`href="${link}"`);
      expect(`${subject} ${copy}`).not.toMatch(/\bask(s|ed)?\b/i);
      expect(`${subject} ${copy}`).not.toMatch(/\b(we|us|our)\b/i);
      expect(`${subject} ${copy}`).not.toContain(String.fromCharCode(0x2014));
    },
  );

  it.each([
    {
      title: 'an answered request in a room that cannot be read',
      workflowId: 'lender_ask.answered',
      payload: { ...askPayload, roomId: unreadableRoom },
      subject: 'The deal team answered your request',
      message:
        'The deal team has replied to a request you made in your lender room.',
      link: `${siteUrl}/lender/${unreadableRoom}/requests/asks/${askId}`,
    },
    {
      title: 'an answered request whose title cannot be read',
      workflowId: 'lender_ask.answered',
      payload: { ...askPayload, askId: unreadableAsk },
      subject: 'The deal team answered your request',
      message:
        'The deal team has replied to a request you made in your lender room.',
      link: `${siteUrl}/lender/${roomId}/requests/asks/${unreadableAsk}`,
    },
    {
      title: 'a reply about a form in a room that cannot be read',
      workflowId: 'lender_ask.answered',
      payload: { ...formPayload, roomId: unreadableRoom },
      subject: 'The deal team replied about your form',
      message:
        'The deal team has replied about a form you sent through your lender room.',
      link: `${siteUrl}/lender/${unreadableRoom}/requests/forms/${formId}`,
    },
    {
      title: 'a returned form in a room that cannot be read',
      workflowId: 'lender_form.returned',
      payload: { ...formPayload, roomId: unreadableRoom },
      subject: 'The deal team returned your form',
      message:
        'The deal team has completed a form you sent through your lender room.',
      link: `${siteUrl}/lender/${unreadableRoom}/requests/forms/${formId}`,
    },
  ])(
    '$workflowId sends the wording that names nothing for $title',
    async ({ workflowId, payload, subject, message, link }) => {
      const { status, result } = await execute({
        workflowId,
        stepId: 'email',
        payload,
      });
      const copy = textOf(result.outputs.body);

      expect(status).toBe(200);
      expect(result.outputs.subject).toBe(subject);
      expect(copy).toContain(message);
      expect(result.outputs.body).toContain(`href="${link}"`);
      expect(copy).not.toContain('Project Atlas');
      expect(copy).not.toContain('First Harbor Bank');
      expect(copy).not.toContain('Trailing twelve month financials');
    },
  );

  it('rejects a payload that carries no room', async () => {
    const { status } = await execute({
      workflowId: 'lender_ask.answered',
      stepId: 'email',
      payload: { askId, kind: 'ask' },
    });

    expect(status).toBe(400);
  });

  it('rejects a kind that is neither a request nor a form', async () => {
    const { status } = await execute({
      workflowId: 'lender_ask.answered',
      stepId: 'email',
      payload: { ...askPayload, kind: 'memo' },
    });

    expect(status).toBe(400);
  });
});

describe('immediate emails to our team', () => {
  it.each([
    {
      title: 'a new request',
      workflowId: 'lender_ask.opened',
      payload: askPayload,
      subject: 'A lender made a new request',
      link: `${teamRoomUrl}/requests/asks/${askId}`,
      label: 'Open the request',
      closing: 'Open the request to read it and reply.',
    },
    {
      title: 'a reply to a request',
      workflowId: 'lender_ask.replied',
      payload: askPayload,
      subject: 'A lender replied to a request',
      link: `${teamRoomUrl}/requests/asks/${askId}`,
      label: 'Open the request',
      closing: 'Open the request to read it and respond.',
    },
    {
      title: 'a reply about a form',
      workflowId: 'lender_ask.replied',
      payload: formPayload,
      subject: 'A lender replied about a form',
      link: `${teamRoomUrl}/requests/forms/${formId}`,
      label: 'Open the form',
      closing: 'Open the form to read it and respond.',
    },
    {
      title: 'an uploaded form',
      workflowId: 'lender_form.uploaded',
      payload: formPayload,
      subject: 'A lender uploaded a form to complete',
      link: `${teamRoomUrl}/requests/forms/${formId}`,
      label: 'Open the form',
      closing: 'Open the form to see it.',
    },
    {
      title: 'a new request in a room that cannot be read',
      workflowId: 'lender_ask.opened',
      payload: { ...askPayload, roomId: unreadableRoom },
      subject: 'A lender made a new request',
      link: `${siteUrl}/home`,
      label: 'Open your deals',
      closing: "Open the deal's lenders page to read it and reply.",
    },
  ])(
    '$workflowId emails "$subject" linking to the thread for $title',
    async ({ workflowId, payload, subject, link, label, closing }) => {
      const { status, result } = await execute({
        workflowId,
        stepId: 'email',
        payload,
      });

      expect(status).toBe(200);
      expect(result.outputs.subject).toBe(subject);
      expect(result.outputs.body).toMatch(
        new RegExp(`href="${link}"[^>]*>(<[^>]*>|\\s)*${label}<`),
      );
      expect(textOf(result.outputs.body)).toContain(closing);
      expect(result.options.skip).toBe(false);
    },
  );

  it('names the person, the room and the deal when access is requested', async () => {
    const { status, result } = await execute({
      workflowId: 'lender_room.access_requested',
      stepId: 'email',
      payload: { roomId, email: 'banker@firstharbor.example' },
    });
    const copy = textOf(result.outputs.body);

    expect(status).toBe(200);
    expect(result.outputs.subject).toBe(
      'banker@firstharbor.example asked for access to First Harbor Bank',
    );
    expect(copy).toContain(
      'banker@firstharbor.example asked for access to the First Harbor Bank lender room on Acme Tooling',
    );
    expect(result.outputs.body).toContain(`href="${teamRoomUrl}"`);
    expect(copy).toContain('Open the lender room');
    expect(copy).toContain(
      'Reopen the room from its settings to let them back in.',
    );
    expect(copy).not.toContain('Open your deals');
  });

  it.each([
    { answer: 'yes', phrase: 'can close by the date you asked' },
    { answer: 'no', phrase: 'cannot close by the date you asked' },
    { answer: 'need_to_talk', phrase: 'wants to talk about the closing date' },
  ])(
    'tells our team a lender answered $answer on the closing timeline',
    async ({ answer, phrase }) => {
      const { status, result } = await execute({
        workflowId: 'lender_room.timeline_answered',
        stepId: 'email',
        payload: { roomId, answer },
      });

      expect(status).toBe(200);
      expect(result.outputs.subject).toBe(
        'A lender answered your closing timeline question',
      );
      expect(textOf(result.outputs.body)).toContain(
        `First Harbor Bank ${phrase}`,
      );
      expect(result.outputs.body).toContain(`href="${teamRoomUrl}"`);
    },
  );

  it('rejects a timeline answer that is not yes, no or need to talk', async () => {
    const { status } = await execute({
      workflowId: 'lender_room.timeline_answered',
      stepId: 'email',
      payload: { roomId, answer: 'maybe' },
    });

    expect(status).toBe(400);
  });

  it('names only the person when the room of an access request cannot be read', async () => {
    const { status, result } = await execute({
      workflowId: 'lender_room.access_requested',
      stepId: 'email',
      payload: { roomId: unreadableRoom, email: 'banker@firstharbor.example' },
    });

    expect(status).toBe(200);
    expect(result.outputs.subject).toBe(
      'Someone asked for access to a closed lender room',
    );
    expect(textOf(result.outputs.body)).toContain(
      'banker@firstharbor.example asked for access to a lender room that is closed or expired.',
    );
    expect(result.outputs.body).toContain(`href="${siteUrl}/home"`);
    expect(textOf(result.outputs.body)).toContain('Open your deals');
    expect(textOf(result.outputs.body)).toContain(
      "Reopen the room from the deal's lenders page to let them back in.",
    );
  });

  it.each([
    { missing: 'email', payload: { roomId } },
    { missing: 'room', payload: { email: 'banker@firstharbor.example' } },
  ])(
    'rejects an access request that carries no $missing',
    async ({ payload }) => {
      const { status } = await execute({
        workflowId: 'lender_room.access_requested',
        stepId: 'email',
        payload,
      });

      expect(status).toBe(400);
    },
  );
});

describe('form signature outcome emails', () => {
  const signaturePayload = { roomId, askId: formId };
  const formLink = `${siteUrl}/lender/${roomId}/requests/forms/${formId}`;

  it.each([
    {
      workflowId: 'lender_form.signature_completed',
      audience: 'lender',
      subject: 'Acme Capital on Project Atlas: your form has been signed',
      message:
        'The signed copy of "Loan application" is in the First Harbor Bank lender room.',
      link: formLink,
    },
    {
      workflowId: 'lender_form.signature_completed',
      audience: 'team',
      subject: 'A lender form has been signed',
      message:
        'The signed copy of "Loan application" is in the First Harbor Bank lender room.',
      link: `${teamRoomUrl}/requests/forms/${formId}`,
    },
    {
      workflowId: 'lender_form.signature_declined',
      audience: 'lender',
      subject: 'Acme Capital on Project Atlas: signing was declined',
      message:
        'The signature request for "Loan application" in the First Harbor Bank lender room was declined or cancelled. Acme Capital will follow up in the thread.',
      link: formLink,
    },
    {
      workflowId: 'lender_form.signature_declined',
      audience: 'team',
      subject: 'A lender form signature was declined',
      message:
        'The signature request for "Loan application" in the First Harbor Bank lender room was declined or cancelled. A new signature request can be made from the form\'s page.',
      link: `${teamRoomUrl}/requests/forms/${formId}`,
    },
    {
      workflowId: 'lender_form.signature_expired',
      audience: 'lender',
      subject: 'Acme Capital on Project Atlas: signing expired',
      message:
        'The signature request for "Loan application" in the First Harbor Bank lender room expired before everyone signed. Acme Capital will follow up in the thread.',
      link: formLink,
    },
    {
      workflowId: 'lender_form.signature_expired',
      audience: 'team',
      subject: 'A lender form signature expired',
      message:
        'The signature request for "Loan application" in the First Harbor Bank lender room expired before everyone signed. A new signature request can be made from the form\'s page.',
      link: `${teamRoomUrl}/requests/forms/${formId}`,
    },
  ])(
    '$workflowId tells the $audience "$subject"',
    async ({ workflowId, audience, subject, message, link }) => {
      const { status, result } = await execute({
        workflowId,
        stepId: 'email',
        payload: { ...signaturePayload, audience },
      });
      const copy = textOf(result.outputs.body);

      expect(status).toBe(200);
      expect(result.outputs.subject).toBe(subject);
      expect(copy).toContain(message);
      expect(result.outputs.body?.split('Loan application')).toHaveLength(2);
      expect(result.outputs.body).toContain(`href="${link}"`);
      expect(copy).toContain(
        audience === 'lender' ? 'View the form' : 'Open the form',
      );
      expect(copy).not.toContain('Open your deals');
      expect(`${subject} ${copy}`).not.toMatch(/\bask(s|ed)?\b/i);
      expect(`${subject} ${copy}`).not.toContain(String.fromCharCode(0x2014));
      if (audience === 'lender') {
        expect(`${subject} ${copy}`).not.toMatch(/\b(we|us|our)\b/i);
      }
    },
  );

  it.each([
    {
      workflowId: 'lender_form.signature_completed',
      audience: 'lender',
      subject: 'The deal team: your form has been signed',
      message: 'The signed copy of a form you sent is in your lender room.',
      link: `${siteUrl}/lender/${unreadableRoom}/requests/forms/${formId}`,
    },
    {
      workflowId: 'lender_form.signature_declined',
      audience: 'lender',
      subject: 'The deal team: signing was declined',
      message:
        'The signature request for a form you sent in your lender room was declined or cancelled. The deal team will follow up in the thread.',
      link: `${siteUrl}/lender/${unreadableRoom}/requests/forms/${formId}`,
    },
    {
      workflowId: 'lender_form.signature_expired',
      audience: 'team',
      subject: 'A lender form signature expired',
      message:
        "The signature request for a form in a lender room expired before everyone signed. A new signature request can be made from the deal's lenders page.",
      link: `${siteUrl}/home`,
    },
  ])(
    '$workflowId names nothing for the $audience when the lookup fails',
    async ({ workflowId, audience, subject, message, link }) => {
      const { status, result } = await execute({
        workflowId,
        stepId: 'email',
        payload: { roomId: unreadableRoom, askId: formId, audience },
      });
      const copy = textOf(result.outputs.body);

      expect(status).toBe(200);
      expect(result.outputs.subject).toBe(subject);
      expect(copy).toContain(message);
      expect(result.outputs.body).toContain(`href="${link}"`);
      expect(copy).not.toContain('Project Atlas');
      expect(copy).not.toContain('First Harbor Bank');
      expect(copy).not.toContain('Loan application');
      expect(copy).toContain(
        audience === 'lender' ? 'View the form' : 'Open your deals',
      );
    },
  );

  it.each([
    { title: 'an audience that is neither side', audience: 'signer' },
    { title: 'no audience', audience: undefined },
  ])('rejects $title', async ({ audience }) => {
    const { status } = await execute({
      workflowId: 'lender_form.signature_completed',
      stepId: 'email',
      payload: { ...signaturePayload, audience },
    });

    expect(status).toBe(400);
  });
});

describe('daily documents digest', () => {
  const payload = { documentId: balanceSheet, isNewVersion: false };
  const listed = completed('visible-documents', {
    checked: true,
    rooms: [
      {
        roomId,
        name: 'Project Atlas',
        items: [
          { kind: 'document', name: 'Balance sheet.xlsx', status: 'new' },
          { kind: 'document', name: 'Tax return 2025.pdf', status: 'updated' },
        ],
        moreCount: 0,
      },
    ],
  });

  it('batches until 22:00 UTC each day', async () => {
    const { result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'daily-digest',
      payload,
    });

    expect(result.outputs).toMatchObject({ type: 'timed', cron: '0 22 * * *' });
  });

  it('batches over the configured number of minutes when an interval is set', async () => {
    const { result } = await execute({
      bridge: createLenderBridge({ ...deps, digestIntervalMinutes: 1 }),
      workflowId: 'lender-room-documents',
      stepId: 'daily-digest',
      payload,
    });

    expect(result.outputs).toEqual({ amount: 1, unit: 'minutes' });
  });

  it('looks up the digested documents for the person the digest is for', async () => {
    const { result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'visible-documents',
      payload,
      state: [
        digestOf([
          { documentId: balanceSheet, isNewVersion: false },
          { documentId: taxReturn, isNewVersion: true },
        ]),
      ],
    });

    expect(result.outputs).toEqual(listed.outputs);
  });

  it('looks up the digested FAQ entries alongside the documents, dropping the ones no longer shown', async () => {
    const { result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'visible-documents',
      payload,
      state: [
        digestOf([
          { documentId: balanceSheet, isNewVersion: false },
          { kind: 'faq', entryId: ebitdaEntry },
          { kind: 'faq', entryId: hiddenEntry },
          { kind: 'faq', entryId: ebitdaEntry },
        ]),
      ],
    });

    expect(result.outputs).toEqual({
      checked: true,
      rooms: [
        {
          roomId,
          name: 'Project Atlas',
          items: [
            { kind: 'document', name: 'Balance sheet.xlsx', status: 'new' },
            { kind: 'faq', question: 'What was 2025 EBITDA?' },
          ],
          moreCount: 0,
        },
      ],
    });
  });

  it('records that nothing was checked when the lookup fails', async () => {
    const { status, result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'visible-documents',
      payload,
      subscriber: { subscriberId: personWhoseLookupFails },
      state: [digestOf([{ documentId: balanceSheet, isNewVersion: false }])],
    });

    expect(status).toBe(200);
    expect(result.outputs).toEqual({ checked: false, rooms: [] });
  });

  it('fails the step when a digested event names no document', async () => {
    const { status, result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'visible-documents',
      payload,
      state: [digestOf([{ isNewVersion: false }])],
    });

    expect(status).toBe(502);
    expect(result.outputs).toBeUndefined();
  });

  it('fails the step when Novu names no person', async () => {
    const { status, result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'visible-documents',
      payload,
      subscriber: {},
      state: [digestOf([{ documentId: balanceSheet, isNewVersion: false }])],
    });

    expect(status).toBe(502);
    expect(result.outputs).toBeUndefined();
  });

  it('emails the visible documents grouped by room with a link into the room', async () => {
    const { result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'email',
      payload,
      state: [digestOf([payload]), listed],
    });

    expect(result.options.skip).toBe(false);
    expect(result.outputs.subject).toBe(
      '2 new or updated documents in your lender room',
    );
    expect(result.outputs.body).toContain('Balance sheet.xlsx (new)');
    expect(result.outputs.body).toContain('Tax return 2025.pdf (updated)');
    expect(result.outputs.body).toContain(`href="${siteUrl}/lender/${roomId}"`);
  });

  it('emails a day of FAQ entries under a neutral subject with a link to the room FAQ', async () => {
    const { result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'email',
      payload,
      state: [
        digestOf([{ kind: 'faq', entryId: ebitdaEntry }]),
        completed('visible-documents', {
          checked: true,
          rooms: [
            {
              roomId,
              name: 'First Harbor Bank',
              items: [{ kind: 'faq', question: 'What was 2025 EBITDA?' }],
              moreCount: 0,
            },
          ],
        }),
      ],
    });

    expect(result.outputs.subject).toBe('Updates in your lender room');
    expect(result.outputs.body).toContain(
      `href="${siteUrl}/lender/${roomId}/faq"`,
    );
    expect(textOf(result.outputs.body)).toContain(
      'What was 2025 EBITDA? (FAQ)',
    );
  });

  it('sends no email when nothing is still visible', async () => {
    const { result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'email',
      payload,
      state: [
        digestOf([payload]),
        completed('visible-documents', { checked: true, rooms: [] }),
      ],
    });

    expect(result.options.skip).toBe(true);
    expect(result.outputs.body).toBeUndefined();
  });

  it('sends a notice with no file names when the lookup failed', async () => {
    const { result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'email',
      payload,
      state: [
        digestOf([payload]),
        completed('visible-documents', { checked: false, rooms: [] }),
      ],
    });
    const copy = textOf(result.outputs.body);

    expect(result.options.skip).toBe(false);
    expect(result.outputs.subject).toBe(
      'New or updated documents in your lender room',
    );
    expect(result.outputs.body).toContain(`href="${siteUrl}/lender"`);
    expect(copy).not.toContain('Balance sheet');
    expect(copy).not.toContain('First Harbor Bank');
  });

  it('fails the email step when the recorded lookup result is not one it wrote', async () => {
    const { status, result } = await execute({
      workflowId: 'lender-room-documents',
      stepId: 'email',
      payload,
      state: [
        digestOf([payload]),
        completed('visible-documents', { rooms: 'First Harbor Bank' }),
      ],
    });

    expect(status).toBe(400);
    expect(result.outputs).toBeUndefined();
  });
});

describe('deal event email notices', () => {
  const path = `/home/acme-capital/deals/${dealId}/financials#offer-o-1`;
  const dealPayload = { dealId, path, firmName: 'Acme Tooling' };
  const dealLink = `${siteUrl}${path}`;

  it.each([
    ['deal.offer_submitted', 'Offer submitted on Acme Tooling'],
    ['deal.offer_accepted', 'Offer accepted on Acme Tooling'],
    ['deal.loi_accepted', 'LOI accepted on Acme Tooling'],
    ['deal.apa_accepted', 'APA accepted on Acme Tooling'],
  ])(
    '%s emails "%s" with the link the relay chose',
    async (workflowId, line) => {
      const { result } = await execute({
        workflowId,
        stepId: 'email',
        payload: dealPayload,
      });

      expect(result.outputs.subject).toBe(line);
      expect(textOf(result.outputs.body)).toContain(line);
      expect(result.outputs.body).toContain(dealLink);
    },
  );

  it('names a deal without a firm "your deal"', async () => {
    const { result } = await execute({
      workflowId: 'deal.offer_accepted',
      stepId: 'email',
      payload: { ...dealPayload, firmName: null },
    });

    expect(result.outputs.subject).toBe('Offer accepted on your deal');
  });

  it.each([
    ['closed', 'Acme Tooling closed'],
    ['lost', 'Acme Tooling was marked lost'],
  ])('emails a %s resolution as "%s"', async (outcome, line) => {
    const { result } = await execute({
      workflowId: 'deal.resolved',
      stepId: 'email',
      payload: { ...dealPayload, outcome },
    });

    expect(result.outputs.subject).toBe(line);
    expect(result.outputs.body).toContain(dealLink);
  });
});

describe('daily lenders to nudge email', () => {
  const nudgePayload = {
    accountSlug: 'acme-capital',
    lenders: [
      {
        lenderName: 'First Harbor Bank',
        deals: [
          { dealName: 'Acme Tooling', daysSilent: 12 },
          { dealName: null, daysSilent: 6 },
        ],
      },
      {
        lenderName: 'Second Harbor Bank',
        deals: [{ dealName: 'Acme Tooling', daysSilent: 8 }],
      },
    ],
  };

  it('lists each quiet lender with its deals and days quiet, linking to the team lenders page', async () => {
    const { status, result } = await execute({
      workflowId: 'lender-nudges.daily',
      stepId: 'email',
      payload: nudgePayload,
    });
    const copy = textOf(result.outputs.body);

    expect(status).toBe(200);
    expect(result.outputs.subject).toBe('2 lenders to nudge today');
    expect(copy).toContain(
      'First Harbor Bank: Acme Tooling, quiet 12 days; your deal, quiet 6 days.',
    );
    expect(copy).toContain('Second Harbor Bank: Acme Tooling, quiet 8 days.');
    expect(result.outputs.body).toContain(
      `href="${siteUrl}/home/acme-capital/lenders"`,
    );
  });

  it('says lender, not lenders, when one is due', async () => {
    const { result } = await execute({
      workflowId: 'lender-nudges.daily',
      stepId: 'email',
      payload: { ...nudgePayload, lenders: nudgePayload.lenders.slice(0, 1) },
    });

    expect(result.outputs.subject).toBe('1 lender to nudge today');
  });

  it('rejects a payload that names no team', async () => {
    const { status } = await execute({
      workflowId: 'lender-nudges.daily',
      stepId: 'email',
      payload: { lenders: nudgePayload.lenders },
    });

    expect(status).toBe(400);
  });
});
