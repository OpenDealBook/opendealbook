import { beforeEach, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => [] as { text: string }[]);

vi.mock('@odb/mailers', () => ({
  getMailer: async () => ({
    sendEmail: async (email: { text: string }) => {
      sent.push(email);
    },
  }),
}));

import type { LenderRoomSummary } from './entry-rules';
import { sendLenderInvite } from './sign-in-link';

const ROOM: LenderRoomSummary = {
  id: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
  deal_id: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22',
  name: 'Bluefin Test Lending',
  welcome_note: null,
  expires_at: null,
  is_open: true,
  private_folder_id: 'own',
  master_folder_id: 'package',
  brand_name: null,
  brand_logo_path: null,
  deal_name: 'Dockside',
  target_close_date: null,
  must_close_by: '2027-03-31',
  must_close_reason: null,
  buyer_team: 'Harbor Acquisitions',
  loan_amount: 2240000,
  loan_type: 'sba_7a',
  term_years: 10,
  seller_note_amount: 300000,
};

function result<T>(data: T) {
  return { single: () => ({ throwOnError: async () => ({ data }) }) };
}

const admin = {
  rpc: () => result(ROOM),
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => result({ name: 'Morgan Lee', email: 'morgan@harbor.test' }),
      }),
    }),
  }),
  auth: {
    admin: {
      generateLink: async () => ({
        data: { properties: { hashed_token: 'hash' } },
        error: null,
      }),
    },
  },
};

beforeEach(() => {
  sent.length = 0;
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://odb.test');
});

it('invites the lender with the exact loan amounts and the close-by date spelled out', async () => {
  await sendLenderInvite(
    admin as unknown as Parameters<typeof sendLenderInvite>[0],
    {
      email: 'dana@bluefintestlending.test',
      roomId: ROOM.id!,
      sentBy: 'user-morgan',
    },
  );

  expect(sent[0]!.text).toContain(
    'Loan ask: $2,240,000 SBA 7(a) plus $300,000 seller note, 10-year term',
  );
  expect(sent[0]!.text).toContain('Close by: March 31, 2027');
});
