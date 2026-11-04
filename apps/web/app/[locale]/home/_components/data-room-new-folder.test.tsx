// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en.json';

const server = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn() }));

vi.mock('./data-room-folder-action', () => ({
  createDataRoomFolder: server.create,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { DataRoomNewFolder } from './data-room-new-folder';

const DEAL = '11111111-1111-4111-8111-111111111111';
let container: HTMLDivElement;
let root: Root;

function button(label: string) {
  return [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )!;
}

async function createNamed(name: string) {
  await act(async () =>
    root.render(
      <NextIntlClientProvider locale={'en-US'} messages={messages}>
        <DataRoomNewFolder
          dealId={DEAL}
          folders={[{ id: 'f-fin', name: 'Financials' }]}
        />
      </NextIntlClientProvider>,
    ),
  );
  await act(async () => button('Create folder').click());
  const input = document.querySelector<HTMLInputElement>('input[name=name]')!;
  input.value = name;
  await act(async () => button('Create').click());
}

beforeEach(() => {
  server.create.mockReset();
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

it('creates a top-level folder by default and refreshes the room', async () => {
  server.create.mockResolvedValueOnce({ ok: true, value: {} });

  await createNamed('Insurance');

  expect(server.create).toHaveBeenCalledWith({
    dealId: DEAL,
    parentId: null,
    name: 'Insurance',
  });
  expect(server.refresh).toHaveBeenCalled();
  expect(document.querySelector('input[name=name]')).toBeNull();
});

it('keeps the dialog open and shows why a folder was refused', async () => {
  server.create.mockResolvedValueOnce({
    ok: false,
    refusal: "Viewers can't create folders. Ask Ana Ruiz.",
  });

  await createNamed('Insurance');

  expect(document.querySelector('[role=alert]')?.textContent).toBe(
    "Viewers can't create folders. Ask Ana Ruiz.",
  );
  expect(server.refresh).not.toHaveBeenCalled();
});
