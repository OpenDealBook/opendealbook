// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ remember: vi.fn() }));

vi.mock('@odb/accounts/server/personal-account-actions', () => ({
  rememberDetectedTimezoneAction: server.remember,
}));

import { DetectTimezone } from './detect-timezone';

describe('the browser time zone', () => {
  it("offers the browser's zone to the person's account", async () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Pacific/Auckland' }),
    } as Intl.DateTimeFormat);

    await act(async () => {
      createRoot(document.createElement('div')).render(<DetectTimezone />);
    });

    expect(server.remember).toHaveBeenCalledWith({
      timezone: 'Pacific/Auckland',
    });
  });
});
