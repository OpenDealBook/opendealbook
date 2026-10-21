import { vi } from 'vitest';

const bootable = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  STRIPE_SECRET_KEY: 'test-stripe-secret-key',
  STRIPE_WEBHOOK_SECRET: 'test-stripe-webhook-secret',
  GOTENBERG_URL: 'http://gotenberg.test',
};

export function stubBootEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ ...bootable, ...vars })) {
    vi.stubEnv(name, value);
  }
}
