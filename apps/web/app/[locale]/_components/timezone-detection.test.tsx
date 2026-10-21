import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  user: null as { id: string } | null,
  timezones: new Map<string, string | null>(),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: world.user } }) },
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({
          single: () => ({
            throwOnError: async () => ({
              data: { timezone: world.timezones.get(id) ?? null },
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('./detect-timezone', () => ({ DetectTimezone: () => null }));

import { DetectTimezone } from './detect-timezone';
import { TimezoneDetection } from './timezone-detection';

async function detects() {
  const element = await TimezoneDetection();

  return element?.type === DetectTimezone;
}

describe('when the browser time zone is asked for', () => {
  beforeEach(() => {
    world.user = null;
    world.timezones = new Map();
  });

  it('asks for a signed-in person with no time zone', async () => {
    world.user = { id: 'user-1' };
    world.timezones.set('user-1', null);

    expect(await detects()).toBe(true);
  });

  it('does not ask once the person has a time zone', async () => {
    world.user = { id: 'user-1' };
    world.timezones.set('user-1', 'Europe/Berlin');

    expect(await detects()).toBe(false);
  });

  it('does not ask a visitor who is not signed in', async () => {
    expect(await detects()).toBe(false);
  });
});
