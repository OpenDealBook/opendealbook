import { describe, expect, it, vi } from 'vitest';

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerAdminClient: () => ({
    from: () => ({ delete: () => ({ eq: vi.fn() }) }),
  }),
}));

process.env.SUPABASE_DB_WEBHOOK_SECRET = 'correct-secret';

const { handleDatabaseWebhook } = await import('./handle-database-webhook');

describe('handleDatabaseWebhook', () => {
  it('throws when the signature header does not match the secret', async () => {
    const request = new Request('http://localhost/webhook', {
      method: 'POST',
      headers: { 'X-Supabase-Event-Signature': 'wrong-secret' },
      body: JSON.stringify({
        type: 'DELETE',
        table: 'accounts',
        schema: 'public',
        record: null,
        old_record: { id: 'acc_123' },
      }),
    });

    await expect(handleDatabaseWebhook(request)).rejects.toThrow(
      'Invalid database webhook signature',
    );
  });
});
