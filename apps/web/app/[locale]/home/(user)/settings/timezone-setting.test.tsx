// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/accounts/server/personal-account-actions', () => ({
  updatePersonalTimezoneAction: server.save,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { TimezoneSetting } from './timezone-setting';

let container: HTMLDivElement;
let root: Root;

function zoneSelect() {
  return container.querySelector('select')!;
}

async function render(current: string | null) {
  await act(async () => {
    root.render(
      <TimezoneSetting
        current={current}
        zones={['UTC', 'Asia/Tokyo', 'Europe/Lisbon']}
      />,
    );
  });
}

beforeEach(() => {
  server.save.mockReset().mockResolvedValue({ success: true });
  server.refresh.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the time zone setting', () => {
  it('offers exactly the zones it is given, showing the saved one', async () => {
    await render('Europe/Lisbon');

    const offered = [...zoneSelect().options].map((option) => option.value);

    expect(offered).toEqual(['', 'UTC', 'Asia/Tokyo', 'Europe/Lisbon']);
    expect(zoneSelect().value).toBe('Europe/Lisbon');
  });

  it('saves the zone the person picks', async () => {
    await render('Europe/Lisbon');

    await act(async () => {
      zoneSelect().value = 'Asia/Tokyo';
      zoneSelect().dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(server.save).toHaveBeenCalledWith({ timezone: 'Asia/Tokyo' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('asks a person with no saved zone to pick one', async () => {
    await render(null);

    expect(zoneSelect().value).toBe('');
  });

  it('shows a person saved as UTC as UTC', async () => {
    await render('UTC');

    expect(zoneSelect().value).toBe('UTC');
  });
});
