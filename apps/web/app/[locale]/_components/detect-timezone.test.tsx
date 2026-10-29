// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DetectTimezone } from './detect-timezone';

const offered = vi.fn();

async function mountIn(timeZone: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone }),
  } as Intl.DateTimeFormat);

  await act(async () => {
    createRoot(document.createElement('div')).render(<DetectTimezone />);
  });
}

describe('the browser time zone', () => {
  beforeEach(() => {
    offered.mockReset();
    document.cookie = 'unsupported_timezone=; max-age=0';
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      offered(url, init.method, JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    });
  });

  it("offers the browser's zone to the person's account", async () => {
    await mountIn('Pacific/Auckland');

    expect(offered).toHaveBeenCalledWith('/api/detected-timezone', 'POST', {
      timezone: 'Pacific/Auckland',
    });
  });

  it('stops offering a zone the account refused as unsupported', async () => {
    document.cookie = `unsupported_timezone=${encodeURIComponent('Mars/Olympus_Mons')}`;

    await mountIn('Mars/Olympus_Mons');

    expect(offered).not.toHaveBeenCalled();
  });

  it('offers a new zone after an earlier one was refused', async () => {
    document.cookie = `unsupported_timezone=${encodeURIComponent('Mars/Olympus_Mons')}`;

    await mountIn('Pacific/Auckland');

    expect(offered).toHaveBeenCalledWith('/api/detected-timezone', 'POST', {
      timezone: 'Pacific/Auckland',
    });
  });
});
