import { vi } from 'vitest';

vi.mock(
  '../../asks/lender-actions',
  async () => (await import('./fake-room')).askActions,
);
vi.mock(
  '../../forms/lender-actions',
  async () => (await import('./fake-room')).formActions,
);
vi.mock(
  '../../uploads/actions',
  async () => (await import('./fake-room')).uploadActions,
);
vi.mock(
  '@odb/supabase/client',
  async () => (await import('./fake-room')).browserClient,
);
vi.mock(
  'next/navigation',
  async () => (await import('./fake-room')).navigation,
);
