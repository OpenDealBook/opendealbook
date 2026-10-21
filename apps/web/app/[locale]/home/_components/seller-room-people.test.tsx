// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ remove: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/seller-rooms/members/actions.ts', () => ({
  removeSeller: server.remove,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { SellerRoomPeople } from './seller-room-people';

let container: HTMLDivElement;
let root: Root;

function removeButton() {
  return [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Remove Sam Seller',
  )!;
}

beforeEach(async () => {
  server.remove.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SellerRoomPeople
        dealId={'deal-1'}
        people={[
          {
            id: 'm-1',
            name: 'Sam Seller',
            email: 'sam@seller.test',
            created_at: '',
          },
        ]}
        blockedReason={null}
      />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerRoomPeople', () => {
  it('lists each seller by name and email', () => {
    expect(container.textContent).toContain('Sam Seller');
    expect(container.textContent).toContain('sam@seller.test');
  });

  it('removes a seller and refreshes', async () => {
    server.remove.mockResolvedValueOnce({ ok: true, value: undefined });

    await act(async () => {
      removeButton().click();
    });

    expect(server.remove).toHaveBeenCalledWith({
      dealId: 'deal-1',
      memberId: 'm-1',
    });
    expect(server.refresh).toHaveBeenCalledTimes(1);
  });

  it('says why a removal was refused', async () => {
    server.remove.mockResolvedValueOnce({
      ok: false,
      refusal: 'Seller email is not set up',
    });

    await act(async () => {
      removeButton().click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Seller email is not set up',
    );
  });

  it('disables removal and says why for someone who cannot remove sellers', async () => {
    await act(async () => {
      root.render(
        <SellerRoomPeople
          dealId={'deal-1'}
          people={[
            { id: 'm-1', name: 'Sam Seller', email: 'sam@seller.test', created_at: '' },
          ]}
          blockedReason={'Only deal managers can remove sellers. Ask Morgan Reyes.'}
        />,
      );
    });

    expect(removeButton().disabled).toBe(true);
    expect(container.textContent).toContain(
      'Only deal managers can remove sellers. Ask Morgan Reyes.',
    );
  });
});
