import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recorded = vi.hoisted(() => ({
  signatures: [] as unknown[],
  alreadySigned: false,
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) => (data: unknown) =>
      fn(data, { id: 'user-1' }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({ marker: 'client' }),
  getSupabaseServerAdminClient: () => ({ marker: 'admin' }),
}));

vi.mock('@odb/contracts/esign', async (importOriginal) => {
  const esign = await importOriginal<typeof import('@odb/contracts/esign')>();

  return {
    ...esign,
    createDocumensoClient: () => ({ marker: 'documenso' }),
    recordExternalSignature: async (signature: unknown) => {
      if (recorded.alreadySigned) {
        throw new esign.AlreadySignedInDocumenso();
      }

      recorded.signatures.push(signature);
      return 'version-1';
    },
  };
});

import {
  recordContractSignedElsewhere,
  sendContractForSignature,
} from './contract-signature-actions';

const DEAL_ID = '0b0f5a0e-58a5-4a40-9d4e-6f0f3f3c8a11';

function upload(signedOn: string, file = new File(['%PDF'], 'loi.pdf')) {
  return recordContractSignedElsewhere({
    deal_id: DEAL_ID,
    type: 'loi',
    contract_id: null,
    party: 'buyer',
    signed_on: signedOn,
    file,
  });
}

beforeEach(() => {
  recorded.signatures.length = 0;
  recorded.alreadySigned = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T23:30:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recording a contract signed outside the platform', () => {
  it('records a copy signed as late as tomorrow in UTC', async () => {
    expect(await upload('2026-10-17')).toEqual({
      ok: true,
      value: 'version-1',
    });
  });

  it('refuses a signing date after tomorrow in UTC, recording nothing', async () => {
    expect(await upload('2026-10-18')).toEqual({
      ok: false,
      refusal: 'The signing date cannot be in the future',
    });
    expect(recorded.signatures).toEqual([]);
  });

  it('refuses a missing signing date', async () => {
    expect(await upload('')).toMatchObject({ ok: false });
    expect(recorded.signatures).toEqual([]);
  });

  it.each([
    ['loi.pdf', 'pdf'],
    ['APA Final.DOCX', 'docx'],
  ])('records %s as a %s copy with its bytes', async (name, kind) => {
    await upload('2026-10-02', new File(['signed'], name));

    expect(recorded.signatures).toMatchObject([
      {
        dealId: DEAL_ID,
        type: 'loi',
        contractId: null,
        party: 'buyer',
        signedOn: '2026-10-02',
        copy: { kind, bytes: new TextEncoder().encode('signed') },
      },
    ]);
  });

  it('refuses a file that is neither a PDF nor a .docx, recording nothing', async () => {
    expect(
      await upload('2026-10-02', new File(['scan'], 'signed.jpg')),
    ).toEqual({
      ok: false,
      refusal: 'Upload the signed contract as a PDF or a .docx file',
    });
    expect(recorded.signatures).toEqual([]);
  });

  it('refuses when Documenso shows the contract was already signed there', async () => {
    recorded.alreadySigned = true;

    expect(await upload('2026-10-02')).toEqual({
      ok: false,
      refusal:
        'Documenso shows this was already signed. Use Check signature status to record it.',
    });
  });
});

describe('sending a contract version for signature', () => {
  it.each([
    ['no signers', [], 'Name at least one signer'],
    [
      'a signer without a name',
      [{ name: ' ', email: 'buyer@example.com' }],
      'Each signer needs a name',
    ],
    [
      'a signer without a valid email address',
      [{ name: 'Bea Buyer', email: 'buyer' }],
      'Each signer needs a valid email address',
    ],
  ])('refuses %s before reading anything', async (_label, signers, refusal) => {
    expect(
      await sendContractForSignature({
        contract_version_id: DEAL_ID,
        signers,
      }),
    ).toEqual({ ok: false, refusal });
  });
});
