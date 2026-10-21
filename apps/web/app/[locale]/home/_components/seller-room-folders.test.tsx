// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  show: vi.fn(),
  hide: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/seller-rooms/folders/actions.ts', () => ({
  showSellerRoomFolder: server.show,
  hideSellerRoomFolder: server.hide,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { SellerRoomFolders } from './seller-room-folders';

const financials = 'f0000000-0000-4000-8000-000000000001';
const year = 'f0000000-0000-4000-8000-000000000002';
const internal = 'f0000000-0000-4000-8000-000000000003';

const listed: Parameters<typeof SellerRoomFolders>[0]['folders'] = [
  { id: financials, parentId: null, name: 'Financials', shown: 'picked' },
  { id: year, parentId: financials, name: '2024', shown: 'with-parent' },
  { id: internal, parentId: null, name: 'Internal', shown: 'hidden' },
];

let container: HTMLDivElement;
let root: Root;

function box(name: string) {
  return container.querySelector<HTMLInputElement>(
    `input[aria-label="Show ${name} to sellers"]`,
  )!;
}

async function render() {
  await act(async () => {
    root.render(<SellerRoomFolders dealId={'deal-1'} folders={listed} />);
  });
}

beforeEach(() => {
  server.show.mockReset();
  server.hide.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SellerRoomFolders', () => {
  it('shows which folders the room shows, with subfolders following their parent', async () => {
    await render();

    expect(box('Financials').checked).toBe(true);
    expect(box('2024').checked).toBe(true);
    expect(box('2024').disabled).toBe(true);
    expect(box('Internal').checked).toBe(false);
  });

  it('shows a hidden folder when the team ticks it, then refreshes the page', async () => {
    server.show.mockResolvedValueOnce({ ok: true, value: undefined });
    await render();

    await act(async () => {
      box('Internal').click();
    });

    expect(server.show).toHaveBeenCalledWith({
      dealId: 'deal-1',
      folderId: internal,
    });
    expect(server.refresh).toHaveBeenCalledTimes(1);
  });

  it('hides a picked folder when the team unticks it', async () => {
    server.hide.mockResolvedValueOnce({ ok: true, value: undefined });
    await render();

    await act(async () => {
      box('Financials').click();
    });

    expect(server.hide).toHaveBeenCalledWith({
      dealId: 'deal-1',
      folderId: financials,
    });
  });

  it('says why a change was refused', async () => {
    server.show.mockResolvedValueOnce({
      ok: false,
      refusal: 'This team is read-only until billing is updated.',
    });
    await render();

    await act(async () => {
      box('Internal').click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'This team is read-only until billing is updated.',
    );
  });
});
