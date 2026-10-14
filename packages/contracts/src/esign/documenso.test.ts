import type { SupabaseClient } from '@supabase/supabase-js';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { Database } from '@odb/supabase';

import type { ContractStorage } from '../storage';
import {
  ContractNotFound,
  DocumensoRejected,
  checkContractSignature,
  contractSignatureEditorUrl,
  createDocumensoClient,
  handleContractSignatureEvent,
  requestContractSignature,
  signatureEventDocumentId,
} from './documenso';
import createEnvelopeResponse from './fixtures/create-envelope-response.json';
import envelopeCancelled from './fixtures/envelope-cancelled.json';
import envelopeCompleted from './fixtures/envelope-completed.json';
import envelopeDraft from './fixtures/envelope-draft.json';
import envelopeExpired from './fixtures/envelope-expired.json';
import envelopeNotFound from './fixtures/envelope-not-found.json';
import envelopePending from './fixtures/envelope-pending.json';
import envelopeRejected from './fixtures/envelope-rejected.json';
import envelopeTwoFilesCompleted from './fixtures/envelope-two-files-completed.json';
import documentCancelled from './fixtures/webhook-document-cancelled.json';
import documentCompleted from './fixtures/webhook-document-completed.json';
import documentRejected from './fixtures/webhook-document-rejected.json';
import documentSent from './fixtures/webhook-document-sent.json';
import documentSigned from './fixtures/webhook-document-signed.json';
import recipientExpired from './fixtures/webhook-recipient-expired.json';

import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const ENVELOPE_ID = createEnvelopeResponse.id;
const TEAM_URL = envelopeDraft.team.url;
const API_KEY = 'api_test';
const SIGNER = { email: 'seller@example.com', name: 'Seller' };

interface Received {
  method: string;
  path: string;
  authorization: string | undefined;
  json?: unknown;
  payload?: unknown;
  pdf?: number[];
}

type Envelope = { envelopeItems: { id: string; order: number }[] };

const documenso = {
  server: null as unknown as Server,
  url: '',
  isDown: false,
  neverAnswers: false,
  refusesToDelete: false,
  rejectsWith: null as number | null,
  received: [] as Received[],
  envelopes: new Map<string, unknown>(),
};

function editorUrlOf(documentId: string) {
  return `${documenso.url}/t/${TEAM_URL}/documents/${documentId}/edit`;
}

function signedCopyOf(envelope: Envelope, order: number) {
  return `%PDF-1.7 signed ${envelope.envelopeItems.find((item) => item.order === order)!.id}`;
}

async function recorded(request: Request): Promise<Received> {
  const url = new URL(request.url);
  const received: Received = {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    authorization: request.headers.get('authorization') ?? undefined,
  };
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.startsWith('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('files') as File;
    received.payload = JSON.parse(form.get('payload') as string);
    received.pdf = [...new Uint8Array(await file.arrayBuffer())];
  }

  if (contentType.startsWith('application/json')) {
    received.json = await request.json();
  }

  return received;
}

function replay(received: Received): {
  status: number;
  body: string;
  contentType: string;
} {
  const route = `${received.method} ${received.path}`;
  const json = (body: unknown, status = 200) => ({
    status,
    body: JSON.stringify(body),
    contentType: 'application/json',
  });

  if (route === 'POST /api/v2/envelope/create') {
    return json(createEnvelopeResponse);
  }

  if (route === 'POST /api/v2/envelope/delete') {
    return documenso.refusesToDelete
      ? json({ message: 'no' }, 500)
      : json({ success: true });
  }

  const signedItem =
    /^GET \/api\/v2\/envelope\/item\/([^/]+)\/download\?version=signed$/.exec(
      route,
    );

  if (signedItem) {
    return {
      status: 200,
      body: `%PDF-1.7 signed ${signedItem[1]}`,
      contentType: 'application/pdf',
    };
  }

  const envelope = /^GET \/api\/v2\/envelope\/([^/]+)$/.exec(route);

  return envelope && documenso.envelopes.has(envelope[1]!)
    ? json(documenso.envelopes.get(envelope[1]!))
    : json(envelopeNotFound, 404);
}

beforeAll(async () => {
  documenso.server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];

    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', async () => {
      if (documenso.neverAnswers) {
        return;
      }

      if (documenso.isDown || documenso.rejectsWith !== null) {
        outgoing.writeHead(documenso.rejectsWith ?? 500).end('{}');
        return;
      }

      const received = await recorded(
        new Request(`${documenso.url}${incoming.url}`, {
          method: incoming.method,
          headers: incoming.headers as Record<string, string>,
          body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
        }),
      );
      documenso.received.push(received);

      const replayed = replay(received);
      outgoing
        .writeHead(replayed.status, { 'content-type': replayed.contentType })
        .end(replayed.body);
    });
  });
  await new Promise<void>((resolve) => documenso.server.listen(0, resolve));
  documenso.url = `http://127.0.0.1:${(documenso.server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  documenso.isDown = false;
  documenso.neverAnswers = false;
  documenso.refusesToDelete = false;
  documenso.rejectsWith = null;
  documenso.received.length = 0;
  documenso.envelopes.clear();
  documenso.envelopes.set(ENVELOPE_ID, envelopeDraft);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  documenso.server.closeAllConnections();
  await new Promise((resolve) => documenso.server.close(resolve));
});

function client() {
  return createDocumensoClient({ url: documenso.url, apiKey: API_KEY });
}

function documensoReports(envelope: unknown, documentId = ENVELOPE_ID) {
  documenso.envelopes.set(documentId, envelope);
}

function requestsTo(path: string) {
  return documenso.received.filter((received) => received.path === path);
}

describe('creating a draft in Documenso', () => {
  it('uploads the PDF as an envelope with each signer and no fields', async () => {
    await client().createDraft({
      title: 'LOI',
      externalId: 'ver-2',
      pdf: new Uint8Array([37, 80, 68, 70]),
      signers: [SIGNER],
    });

    expect(documenso.received).toEqual([
      {
        method: 'POST',
        path: '/api/v2/envelope/create',
        authorization: API_KEY,
        payload: {
          type: 'DOCUMENT',
          title: 'LOI',
          externalId: 'ver-2',
          recipients: [
            { email: 'seller@example.com', name: 'Seller', role: 'SIGNER' },
          ],
        },
        pdf: [37, 80, 68, 70],
      },
    ]);
  });

  it('returns the envelope id that later webhooks carry', async () => {
    const draft = await client().createDraft({
      title: 'LOI',
      externalId: 'ver-2',
      pdf: new Uint8Array([37, 80, 68, 70]),
      signers: [SIGNER],
    });

    expect(draft).toEqual({ documentId: ENVELOPE_ID });
  });

  it('throws when Documenso returns a non-2xx status', async () => {
    documenso.isDown = true;

    await expect(
      client().createDraft({
        title: 'LOI',
        externalId: 'ver-2',
        pdf: new Uint8Array(),
        signers: [SIGNER],
      }),
    ).rejects.toThrow('Documenso responded with 500');
  });
});

describe('a request Documenso does not accept', () => {
  it('is told apart from Documenso failing, so a person can be asked to fix it', async () => {
    documenso.rejectsWith = 400;

    await expect(
      client().createDraft({
        title: 'LOI',
        externalId: 'ver-2',
        pdf: new Uint8Array(),
        signers: [SIGNER],
      }),
    ).rejects.toBeInstanceOf(DocumensoRejected);
  });

  it.each([401, 500])('is not what a %s answer means', async (status) => {
    documenso.rejectsWith = status;

    const failure = await client()
      .createDraft({
        title: 'LOI',
        externalId: 'ver-2',
        pdf: new Uint8Array(),
        signers: [SIGNER],
      })
      .catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(DocumensoRejected);
    expect(failure).toEqual(new Error(`Documenso responded with ${status}`));
  });
});

describe('removing a draft from Documenso', () => {
  it('deletes the envelope', async () => {
    await client().deleteDraft(ENVELOPE_ID);

    expect(documenso.received).toEqual([
      {
        method: 'POST',
        path: '/api/v2/envelope/delete',
        authorization: API_KEY,
        json: { envelopeId: ENVELOPE_ID },
      },
    ]);
  });
});

describe('where a document is edited in Documenso', () => {
  it("gives the editor page of the envelope under its team's address", async () => {
    expect(await client().editorUrl(ENVELOPE_ID)).toBe(
      editorUrlOf(ENVELOPE_ID),
    );
  });
});

describe('what Documenso says the state of a document is', () => {
  it.each([
    ['a draft', envelopeDraft, 'draft'],
    ['sent and waiting for signatures', envelopePending, 'sent'],
    ['completed', envelopeCompleted, 'completed'],
    ['rejected by a signer', envelopeRejected, 'rejected'],
    ['cancelled', envelopeCancelled, 'cancelled'],
    ['waiting on a signer whose deadline passed', envelopeExpired, 'expired'],
  ])('reads an envelope that is %s', async (_label, envelope, state) => {
    documensoReports(envelope);

    expect(await client().signatureState(ENVELOPE_ID)).toBe(state);
  });

  it('reads an envelope Documenso no longer has as missing', async () => {
    documenso.envelopes.clear();

    expect(await client().signatureState(ENVELOPE_ID)).toBe('missing');
  });

  it('throws when Documenso fails, so nobody mistakes an outage for a state', async () => {
    documenso.isDown = true;

    await expect(client().signatureState(ENVELOPE_ID)).rejects.toThrow(
      'Documenso responded with 500',
    );
  });
});

describe('fetching the signed PDF of a completed document', () => {
  it('returns the signed bytes of the envelope file', async () => {
    documensoReports(envelopeCompleted);

    const pdf = await client().downloadSignedPdf(ENVELOPE_ID);

    expect(Buffer.from(pdf).toString('latin1')).toBe(
      signedCopyOf(envelopeCompleted, 1),
    );
  });

  it('returns the file we uploaded when someone added another file in Documenso', async () => {
    documensoReports({
      ...envelopeTwoFilesCompleted,
      envelopeItems: envelopeTwoFilesCompleted.envelopeItems.toReversed(),
    });

    const pdf = await client().downloadSignedPdf(ENVELOPE_ID);

    expect(Buffer.from(pdf).toString('latin1')).toBe(
      signedCopyOf(envelopeTwoFilesCompleted, 1),
    );
  });

  it('throws when Documenso returns a non-2xx status', async () => {
    documenso.isDown = true;

    await expect(client().downloadSignedPdf(ENVELOPE_ID)).rejects.toThrow(
      'Documenso responded with 500',
    );
  });
});

describe('a Documenso that never answers', () => {
  function shortenedTimeouts() {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const waits: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      waits.push(milliseconds);
      return realTimeout(milliseconds / 1000);
    });
    documenso.neverAnswers = true;

    return waits;
  }

  const TIMED_OUT = 'The operation was aborted due to timeout';

  it.each([
    ['reading a state', () => client().signatureState(ENVELOPE_ID)],
    ['asking for the editor page', () => client().editorUrl(ENVELOPE_ID)],
    ['removing a draft', () => client().deleteDraft(ENVELOPE_ID)],
  ])('is given up on after 8 seconds when %s', async (_label, ask) => {
    const waits = shortenedTimeouts();

    await expect(ask()).rejects.toThrow(TIMED_OUT);
    expect(waits).toEqual([8_000]);
  });

  it('is given a minute to take the PDF of a new draft', async () => {
    const waits = shortenedTimeouts();

    await expect(
      client().createDraft({
        title: 'LOI',
        externalId: 'ver-2',
        pdf: new Uint8Array([37, 80, 68, 70]),
        signers: [SIGNER],
      }),
    ).rejects.toThrow(TIMED_OUT);
    expect(waits).toEqual([60_000]);
  });

  it('is given a minute to hand over a signed PDF', async () => {
    documensoReports(envelopeCompleted);
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const waits: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      waits.push(milliseconds);
      return realTimeout(milliseconds);
    });

    await client().downloadSignedPdf(ENVELOPE_ID);

    expect(waits).toEqual([8_000, 60_000]);
  });
});

describe('which document a Documenso webhook is about', () => {
  it.each([
    ['sent', documentSent],
    ['completed', documentCompleted],
    ['rejected', documentRejected],
    ['cancelled', documentCancelled],
    ['recipient expired', recipientExpired],
  ])('reads the envelope id of a %s event', (_label, body) => {
    expect(signatureEventDocumentId(body)).toBe(body.payload.envelopeId);
  });

  it('reads a progress event such as one signature as nothing to act on', () => {
    expect(signatureEventDocumentId(documentSigned)).toBeNull();
  });

  it('throws on a body that is not a Documenso webhook', () => {
    expect(() => signatureEventDocumentId({ hello: 'world' })).toThrow();
  });
});

const VERSION_ID = '0b0f5a0e-58a5-4a40-9d4e-6f0f3f3c8a11';
const STALE = { code: '40001', message: 'stale aggregate deal/deal-1' };

function contractsDatabase(
  contractType: 'loi' | 'apa',
  {
    stage = contractType === 'loi' ? 'loi_submitted' : 'pa_submitted',
    signingDocumentId = ENVELOPE_ID as string | null,
  } = {},
) {
  const version = {
    id: VERSION_ID,
    contract_id: 'contract-1',
    version: 2,
    pdf_path: 'acc-1/contract-1/v2.pdf',
    is_signed: false,
    signing_document_id: signingDocumentId,
    signing_status: (signingDocumentId === null ? null : 'draft') as
      | string
      | null,
  };
  const contract = { type: contractType, deal_id: 'deal-1' };
  const deal = { stage, head: 7 };
  const stageEvents: string[] = [];
  const stageEventActors: (string | undefined)[] = [];
  const statusEvents: string[] = [];
  const failures = {
    recordingTheRequest: false,
    markingSigned: false,
    markingSignedTouchesNoRow: false,
    versionIsNotVisible: false,
    anotherDeliveryAdvancesFirst: false,
  };

  function advance(to: string, actor?: string) {
    deal.stage = to;
    deal.head += 1;
    stageEvents.push(to);
    stageEventActors.push(actor);
  }

  function versionTable() {
    let patch: { is_signed: boolean } | null = null;
    let isThisVersion = false;
    const chain = {
      select: () => chain,
      update: (row: { is_signed: boolean }) => {
        patch = row;
        return chain;
      },
      eq: (column: 'id' | 'signing_document_id', value: string) => {
        isThisVersion = version[column] === value;
        return chain;
      },
      maybeSingle: async () => ({
        data:
          isThisVersion && !failures.versionIsNotVisible
            ? { ...version }
            : null,
        error: null,
      }),
      single: async () => ({ data: { ...version }, error: null }),
      then: (
        resolve: (value: {
          data: { id: string }[] | null;
          error: Error | null;
        }) => void,
      ) => {
        if (failures.markingSigned) {
          resolve({ data: null, error: new Error('connection lost') });
          return;
        }

        if (!patch || !isThisVersion || failures.markingSignedTouchesNoRow) {
          resolve({ data: [], error: null });
          return;
        }

        Object.assign(version, patch);
        resolve({ data: [{ id: version.id }], error: null });
      },
    };
    return chain;
  }

  function rowTable(row: () => unknown) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => ({ data: row(), error: null }),
    };
    return chain;
  }

  const tables: Record<string, () => unknown> = {
    contract: () => rowTable(() => contract),
    deal: () => rowTable(() => ({ stage: deal.stage })),
    deal_event: () => rowTable(() => ({ aggregate_seq: deal.head })),
    contract_version: versionTable,
  };

  const supabase = {
    from: (table: string) => tables[table]!(),
    rpc: async (
      _fn: 'append_deal_event',
      args: {
        p_deal_id: string;
        p_aggregate_id: string;
        p_event_type: string;
        p_payload: Record<string, string>;
        p_expected_aggregate_seq?: number;
        p_actor_kind?: string;
      },
    ) => {
      if (args.p_event_type === 'deal.stage_changed') {
        if (failures.anotherDeliveryAdvancesFirst) {
          failures.anotherDeliveryAdvancesFirst = false;
          advance(args.p_payload.stage!, 'service');
        }

        if (args.p_expected_aggregate_seq !== deal.head) {
          return { data: null, error: STALE };
        }

        advance(args.p_payload.stage!, args.p_actor_kind);
      }

      if (args.p_event_type === 'contract.signature_requested') {
        if (failures.recordingTheRequest) {
          return { data: null, error: new Error('connection lost') };
        }

        version.signing_document_id = args.p_payload.signing_document_id!;
        version.signing_status = 'draft';
      }

      if (
        args.p_event_type === 'contract.signature_status_changed' &&
        args.p_aggregate_id === version.contract_id &&
        args.p_payload.version_id === version.id
      ) {
        version.signing_status = args.p_payload.status!;
        statusEvents.push(args.p_payload.status!);
      }

      return { data: null, error: null };
    },
  } as unknown as SupabaseClient<Database>;

  const alreadyFiled = {
    select: () => alreadyFiled,
    eq: () => alreadyFiled,
    maybeSingle: () => ({
      throwOnError: async () => ({ data: { id: version.id } }),
    }),
  };
  const admin = {
    from: () => alreadyFiled,
  } as unknown as SupabaseClient<Database>;

  return {
    deps: { client: supabase, admin, documenso: client() },
    version,
    deal,
    stageEvents,
    stageEventActors,
    statusEvents,
    failures,
  };
}

const storage: ContractStorage = {
  uploadVersion: async () => undefined,
  downloadVersion: async (path) =>
    path === 'acc-1/contract-1/v2.pdf'
      ? new Uint8Array([9, 9, 9])
      : new Uint8Array(),
};

describe('requesting a signature for a contract version', () => {
  const request = {
    contractVersionId: VERSION_ID,
    dealId: 'deal-1',
    signers: [SIGNER],
  };

  it('drafts the stored PDF in Documenso, tagged with the version id', async () => {
    const { deps } = contractsDatabase('loi', { signingDocumentId: null });

    await requestContractSignature(request, { ...deps, storage });

    expect(requestsTo('/api/v2/envelope/create')).toMatchObject([
      {
        payload: {
          title: 'Contract contract-1 version 2',
          externalId: VERSION_ID,
        },
        pdf: [9, 9, 9],
      },
    ]);
  });

  it('records the Documenso id on the version and says where to place fields and send', async () => {
    const { deps, version } = contractsDatabase('loi', {
      signingDocumentId: null,
    });

    const editorUrl = await requestContractSignature(request, {
      ...deps,
      storage,
    });

    expect(editorUrl).toBe(editorUrlOf(ENVELOPE_ID));
    expect(version.signing_document_id).toBe(ENVELOPE_ID);
    expect(version.signing_status).toBe('draft');
  });

  it('removes the draft from Documenso when our record of it cannot be written', async () => {
    const { deps, version, failures } = contractsDatabase('loi', {
      signingDocumentId: null,
    });
    failures.recordingTheRequest = true;

    await expect(
      requestContractSignature(request, { ...deps, storage }),
    ).rejects.toThrow('connection lost');

    expect(version.signing_document_id).toBeNull();
    expect(requestsTo('/api/v2/envelope/delete')).toMatchObject([
      { json: { envelopeId: ENVELOPE_ID } },
    ]);
  });

  it('still reports why our record could not be written when the draft cannot be removed either, and logs the leftover draft', async () => {
    const { deps, failures } = contractsDatabase('loi', {
      signingDocumentId: null,
    });
    failures.recordingTheRequest = true;
    documenso.refusesToDelete = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      requestContractSignature(request, { ...deps, storage }),
    ).rejects.toThrow('connection lost');

    expect(logged).toHaveBeenCalledWith(
      'A Documenso draft could not be removed',
      {
        documentId: ENVELOPE_ID,
        error: new Error('Documenso responded with 500'),
      },
    );
  });
});

describe('where the signature request of a contract version is edited', () => {
  it('gives the Documenso editor page of the stored document', async () => {
    const { deps } = contractsDatabase('loi');

    expect(await contractSignatureEditorUrl(VERSION_ID, deps)).toBe(
      editorUrlOf(ENVELOPE_ID),
    );
  });

  it('gives nothing for a version with no signature request', async () => {
    const { deps } = contractsDatabase('loi', { signingDocumentId: null });

    expect(await contractSignatureEditorUrl(VERSION_ID, deps)).toBeNull();
  });
});

describe('a signature event for a contract', () => {
  it('marks the version signed once Documenso reports the envelope completed', async () => {
    const { deps, version } = contractsDatabase('apa');
    documensoReports(envelopeCompleted);

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(version.is_signed).toBe(true);
  });

  it('advances the deal from loi_submitted to loi_accepted when a signed LOI completes', async () => {
    const { deps, stageEvents } = contractsDatabase('loi');
    documensoReports(envelopeCompleted);

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(stageEvents).toEqual(['loi_accepted']);
  });

  it('advances the deal as the service, since a webhook has no signed-in user', async () => {
    const { deps, stageEventActors } = contractsDatabase('loi');
    documensoReports(envelopeCompleted);

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(stageEventActors).toEqual(['service']);
  });

  it('advances the deal from pa_submitted to pa_accepted when a signed APA completes', async () => {
    const { deps, stageEvents } = contractsDatabase('apa');
    documensoReports(envelopeCompleted);

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(stageEvents).toEqual(['pa_accepted']);
  });

  it('advances the deal from loi_accepted to pa_submitted when Documenso reports the APA sent', async () => {
    const { deps, version, stageEvents } = contractsDatabase('apa', {
      stage: 'loi_accepted',
    });
    documensoReports(envelopePending);

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(stageEvents).toEqual(['pa_submitted']);
    expect(version.is_signed).toBe(false);
  });

  it('advances the deal from loi_accepted straight to pa_accepted when a signed APA completes and the sent notice was lost', async () => {
    const { deps, version, stageEvents } = contractsDatabase('apa', {
      stage: 'loi_accepted',
    });
    documensoReports(envelopeCompleted);

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(stageEvents).toEqual(['pa_accepted']);
    expect(version.is_signed).toBe(true);
  });

  it('leaves the deal where it is when Documenso reports the LOI sent', async () => {
    const { deps, stageEvents } = contractsDatabase('loi');
    documensoReports(envelopePending);

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(stageEvents).toEqual([]);
  });

  it.each([
    ['a later stage', 'loi', 'pa_submitted'],
    ['an earlier stage', 'loi', 'sourcing'],
    ['a closed deal', 'loi', 'closed'],
    ['a later stage', 'apa', 'closing'],
    ['an earlier stage', 'apa', 'loi_submitted'],
    ['a closed deal', 'apa', 'closed'],
  ] as const)(
    'marks the version signed but leaves the stage alone when completion finds %s (%s at %s)',
    async (_label, contractType, stage) => {
      const { deps, version, deal, stageEvents } = contractsDatabase(
        contractType,
        { stage },
      );
      documensoReports(envelopeCompleted);

      await handleContractSignatureEvent(ENVELOPE_ID, deps);

      expect(version.is_signed).toBe(true);
      expect(stageEvents).toEqual([]);
      expect(deal.stage).toBe(stage);
    },
  );

  it.each([
    ['an earlier stage', 'loi_submitted'],
    ['a later stage', 'pa_accepted'],
    ['a closed deal', 'closed'],
  ])(
    'leaves the stage alone when a sent APA finds %s',
    async (_label, stage) => {
      const { deps, stageEvents } = contractsDatabase('apa', { stage });
      documensoReports(envelopePending);

      await handleContractSignatureEvent(ENVELOPE_ID, deps);

      expect(stageEvents).toEqual([]);
    },
  );

  it('does not drag the deal back when an LOI completion is delivered again after the APA was sent', async () => {
    const { deps, version, deal, stageEvents, failures } =
      contractsDatabase('loi');
    documensoReports(envelopeCompleted);
    failures.markingSigned = true;
    await expect(
      handleContractSignatureEvent(ENVELOPE_ID, deps),
    ).rejects.toThrow('connection lost');
    failures.markingSigned = false;
    deal.stage = 'pa_submitted';

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(version.is_signed).toBe(true);
    expect(deal.stage).toBe('pa_submitted');
    expect(stageEvents).toEqual(['loi_accepted']);
  });

  it.each([
    ['sent', envelopePending, 'loi_accepted', ['pa_submitted']],
    ['completed', envelopeCompleted, 'pa_submitted', ['pa_accepted']],
  ])(
    'advances the deal once when a %s APA is reported twice',
    async (_label, envelope, stage, expected) => {
      const { deps, stageEvents } = contractsDatabase('apa', { stage });
      documensoReports(envelope);

      await handleContractSignatureEvent(ENVELOPE_ID, deps);
      await handleContractSignatureEvent(ENVELOPE_ID, deps);

      expect(stageEvents).toEqual(expected);
    },
  );

  it('advances the deal once when another delivery of the same completion gets there first', async () => {
    const { deps, version, stageEvents, failures } = contractsDatabase('loi');
    documensoReports(envelopeCompleted);
    failures.anotherDeliveryAdvancesFirst = true;

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(stageEvents).toEqual(['loi_accepted']);
    expect(version.is_signed).toBe(true);
  });

  it('finishes marking the version signed on a redelivery, without advancing the deal again', async () => {
    const { deps, version, stageEvents, failures } = contractsDatabase('loi');
    documensoReports(envelopeCompleted);
    failures.markingSigned = true;
    await expect(
      handleContractSignatureEvent(ENVELOPE_ID, deps),
    ).rejects.toThrow('connection lost');
    failures.markingSigned = false;

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(version.is_signed).toBe(true);
    expect(stageEvents).toEqual(['loi_accepted']);
  });

  it('changes nothing while Documenso still reports the envelope waiting, whatever the webhook claimed', async () => {
    const { deps, version, stageEvents } = contractsDatabase('loi');
    documensoReports(envelopePending);

    await handleContractSignatureEvent(
      signatureEventDocumentId({
        ...documentCompleted,
        payload: { ...documentCompleted.payload, envelopeId: ENVELOPE_ID },
      })!,
      deps,
    );

    expect(version.is_signed).toBe(false);
    expect(stageEvents).toEqual([]);
  });

  it('records each state Documenso reports on the version, once', async () => {
    const { deps, version, statusEvents } = contractsDatabase('apa', {
      stage: 'loi_accepted',
    });

    await handleContractSignatureEvent(ENVELOPE_ID, deps);
    documensoReports(envelopePending);
    await handleContractSignatureEvent(ENVELOPE_ID, deps);
    await handleContractSignatureEvent(ENVELOPE_ID, deps);
    documensoReports(envelopeCompleted);
    await handleContractSignatureEvent(ENVELOPE_ID, deps);
    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(statusEvents).toEqual(['sent', 'completed']);
    expect(version.signing_status).toBe('completed');
  });

  it.each([
    ['rejected', 'declined', envelopeRejected],
    ['cancelled', 'declined', envelopeCancelled],
    ['gone from Documenso', 'declined', undefined],
    ['expired', 'expired', envelopeExpired],
  ])(
    'records an LOI whose envelope is %s as %s and moves no stage',
    async (_label, status, envelope) => {
      const { deps, version, stageEvents, statusEvents } =
        contractsDatabase('loi');
      documenso.envelopes.clear();
      if (envelope) {
        documensoReports(envelope);
      }

      await handleContractSignatureEvent(ENVELOPE_ID, deps);

      expect(statusEvents).toEqual([status]);
      expect(version.is_signed).toBe(false);
      expect(stageEvents).toEqual([]);
    },
  );

  it.each([
    ['rejected', 'declined', envelopeRejected],
    ['cancelled', 'declined', envelopeCancelled],
    ['gone from Documenso', 'declined', undefined],
    ['expired', 'expired', envelopeExpired],
  ])(
    'records an APA whose envelope is %s as %s and steps the deal back from pa_submitted to loi_accepted',
    async (_label, status, envelope) => {
      const { deps, version, stageEvents, statusEvents } =
        contractsDatabase('apa');
      documenso.envelopes.clear();
      if (envelope) {
        documensoReports(envelope);
      }

      await handleContractSignatureEvent(ENVELOPE_ID, deps);
      await handleContractSignatureEvent(ENVELOPE_ID, deps);

      expect(statusEvents).toEqual([status]);
      expect(version.is_signed).toBe(false);
      expect(stageEvents).toEqual(['loi_accepted']);
    },
  );

  it.each(['loi_accepted', 'pa_accepted', 'closed'])(
    'records a declined APA without moving a deal that is at %s',
    async (stage) => {
      const { deps, stageEvents, statusEvents } = contractsDatabase('apa', {
        stage,
      });
      documensoReports(envelopeRejected);

      await handleContractSignatureEvent(ENVELOPE_ID, deps);

      expect(statusEvents).toEqual(['declined']);
      expect(stageEvents).toEqual([]);
    },
  );

  it('does not step the deal back again when an old declined APA is reported after a new APA was sent', async () => {
    const { deps, deal, stageEvents } = contractsDatabase('apa');
    documensoReports(envelopeRejected);
    await handleContractSignatureEvent(ENVELOPE_ID, deps);
    deal.stage = 'pa_submitted';

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(deal.stage).toBe('pa_submitted');
    expect(stageEvents).toEqual(['loi_accepted']);
  });

  it('leaves the contract and the deal as they were while the envelope is still a draft', async () => {
    const { deps, version, stageEvents, statusEvents } = contractsDatabase(
      'apa',
      { stage: 'loi_accepted' },
    );

    await handleContractSignatureEvent(ENVELOPE_ID, deps);

    expect(version.is_signed).toBe(false);
    expect(stageEvents).toEqual([]);
    expect(statusEvents).toEqual([]);
  });

  it('changes nothing for a completed envelope we did not create, even one tagged with our version id', async () => {
    const { deps, version, stageEvents } = contractsDatabase('loi');
    const theirs = 'envelope_someoneelsesown';
    documensoReports(
      { ...envelopeCompleted, id: theirs, externalId: VERSION_ID },
      theirs,
    );

    await handleContractSignatureEvent(theirs, deps);

    expect(version.is_signed).toBe(false);
    expect(stageEvents).toEqual([]);
    expect(documenso.received).toEqual([]);
  });
});

describe('checking the signature status of a contract version', () => {
  it('applies what Documenso reports, as a webhook would have', async () => {
    const { deps, version, stageEvents } = contractsDatabase('loi');
    documensoReports(envelopeCompleted);

    await checkContractSignature(VERSION_ID, deps);

    expect(version.is_signed).toBe(true);
    expect(stageEvents).toEqual(['loi_accepted']);
  });

  it('advances the deal as the person who checked', async () => {
    const { deps, stageEventActors } = contractsDatabase('loi');
    documensoReports(envelopeCompleted);

    await checkContractSignature(VERSION_ID, deps);

    expect(stageEventActors).toEqual([undefined]);
  });

  it('fails as not found when the person who checked may not mark the version signed', async () => {
    const { deps, version, failures } = contractsDatabase('loi');
    documensoReports(envelopeCompleted);
    failures.markingSignedTouchesNoRow = true;

    await expect(
      checkContractSignature(VERSION_ID, deps),
    ).rejects.toBeInstanceOf(ContractNotFound);

    expect(version.is_signed).toBe(false);
  });

  it('fails as not found when the person who checked cannot see the version', async () => {
    const { deps, failures } = contractsDatabase('loi');
    failures.versionIsNotVisible = true;

    await expect(
      checkContractSignature(VERSION_ID, deps),
    ).rejects.toBeInstanceOf(ContractNotFound);
  });

  it('repairs a completed version whose deal was never moved, and a second check changes nothing', async () => {
    const { deps, version, stageEvents, statusEvents } = contractsDatabase(
      'apa',
      { stage: 'loi_accepted' },
    );
    version.signing_status = 'completed';
    documensoReports(envelopeCompleted);

    await checkContractSignature(VERSION_ID, deps);

    expect(stageEvents).toEqual(['pa_accepted']);
    expect(version.is_signed).toBe(true);
    expect(statusEvents).toEqual([]);

    await checkContractSignature(VERSION_ID, deps);

    expect(stageEvents).toEqual(['pa_accepted']);
    expect(statusEvents).toEqual([]);
  });

  it('changes nothing for a version with no signature request', async () => {
    const { deps, version, stageEvents } = contractsDatabase('loi', {
      signingDocumentId: null,
    });

    await checkContractSignature(VERSION_ID, deps);

    expect(version.is_signed).toBe(false);
    expect(stageEvents).toEqual([]);
    expect(documenso.received).toEqual([]);
  });
});
