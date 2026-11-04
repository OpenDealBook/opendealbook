// @vitest-environment jsdom
import { act } from 'react';

import { NextIntlClientProvider } from 'next-intl';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../../../../messages/en.json';

const server = vi.hoisted(() => ({
  stage: vi.fn(),
  expand: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@odb/data-room/uploads/actions', () => ({
  stageUpload: server.stage,
}));
vi.mock('./expand-data-room-upload', () => ({
  expandDataRoomUpload: server.expand,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { DataRoomUpload } from './data-room-upload';

const DEAL = '11111111-1111-4111-8111-111111111111';
const FOLDERS = [
  { id: 'f-fin', name: 'Financials' },
  { id: 'f-counsel', name: "Buyer's counsel" },
];

let container: HTMLDivElement;
let root: Root;

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )!;
}

const REFUSAL = "Read-only members can't upload documents. Ask a deal manager.";

function staged(name: string) {
  return {
    ok: true,
    value: {
      batch: { id: 'batch-1', status: 'ready', file_count: 1 },
      items: [
        { id: 'item-1', original_path: name, status: 'pending', error: null },
      ],
    },
  };
}

function expanded(value: unknown) {
  return { ok: true, value };
}

async function choose(folderId: string | null, name: string) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale={'en-US'} messages={messages}>
        <DataRoomUpload dealId={DEAL} folders={FOLDERS} folderId={folderId} />
      </NextIntlClientProvider>,
    );
  });
  await act(async () => {
    button('Upload').click();
  });

  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    value: [new File(['x'], name, { type: 'application/pdf' })],
  });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function upload(folderId: string, name: string) {
  await choose(folderId, name);
  await act(async () => {
    button('Upload').click();
  });
}

async function press(element: Element, key: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

async function pickFolder(name: string) {
  await press(container.querySelector('[role=combobox]')!, 'Enter');
  await press(
    [...document.querySelectorAll('[role=option]')].find(
      (option) => option.textContent === name,
    )!,
    'Enter',
  );
}

beforeEach(() => {
  server.stage.mockReset();
  server.expand.mockReset();
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DataRoomUpload', () => {
  it('starts with no folder and keeps Upload disabled until one is picked', async () => {
    server.stage.mockResolvedValueOnce(staged('lease.pdf'));
    server.expand.mockResolvedValueOnce(expanded({ items: [] }));

    await choose(null, 'lease.pdf');

    expect(
      container.querySelector('[data-slot=select-value]')?.textContent,
    ).toBe('Choose a folder');
    expect(button('Upload').disabled).toBe(true);

    await pickFolder("Buyer's counsel");

    expect(button('Upload').disabled).toBe(false);

    await act(async () => button('Upload').click());

    expect(server.expand).toHaveBeenCalledWith(
      expect.objectContaining({ targetFolderId: 'f-counsel' }),
    );
  });

  it('starts preset to the folder it was opened from', async () => {
    await choose('f-counsel', 'lease.pdf');

    expect(
      container.querySelector('[data-slot=select-value]')?.textContent,
    ).toBe("Buyer's counsel");
    expect(button('Upload').disabled).toBe(false);
  });

  it('puts the chosen file into the folder it was opened from and confirms by name', async () => {
    server.stage.mockResolvedValueOnce(staged('lease.pdf'));
    server.expand.mockResolvedValueOnce(
      expanded({
        imported: 1,
        failed: 0,
        items: [
          {
            id: 'item-1',
            original_path: 'lease.pdf',
            status: 'imported',
            error: null,
          },
        ],
      }),
    );

    await upload('f-fin', 'lease.pdf');

    expect(server.expand).toHaveBeenCalledWith({
      dealId: DEAL,
      batchId: 'batch-1',
      targetFolderId: 'f-fin',
    });
    expect(container.textContent).toContain('Uploaded lease.pdf to Financials');
    expect(server.refresh).toHaveBeenCalled();
  });

  it('lists an uploaded file only in the folder table, not again beside the control', async () => {
    server.stage.mockResolvedValueOnce(staged('lease.pdf'));
    server.expand.mockResolvedValueOnce(
      expanded({
        imported: 1,
        failed: 0,
        items: [
          {
            id: 'item-1',
            original_path: 'lease.pdf',
            status: 'imported',
            error: null,
          },
        ],
      }),
    );

    await upload('f-fin', 'lease.pdf');

    expect(container.querySelector('table')).toBeNull();
  });

  it('shows the refusal inline when a file is refused for the folder', async () => {
    server.stage.mockResolvedValueOnce(staged('memo.pdf'));
    server.expand.mockResolvedValueOnce(
      expanded({
        imported: 0,
        failed: 1,
        items: [
          {
            id: 'item-1',
            original_path: 'memo.pdf',
            status: 'failed',
            error: 'Only deal managers can add documents to counsel folders.',
          },
        ],
      }),
    );

    await upload('f-counsel', 'memo.pdf');

    expect(container.textContent).toContain(
      'memo.pdf was not uploaded: Only deal managers can add documents to counsel folders.',
    );
    expect(container.textContent).not.toContain('Uploaded memo.pdf');
  });

  it('shows why staging was refused and imports nothing', async () => {
    server.stage.mockResolvedValueOnce({ ok: false, refusal: REFUSAL });

    await upload('f-fin', 'lease.pdf');

    expect(container.querySelector('[role=alert]')!.textContent).toBe(REFUSAL);
    expect(server.expand).not.toHaveBeenCalled();
  });

  it('shows why the import was refused', async () => {
    server.stage.mockResolvedValueOnce(staged('lease.pdf'));
    server.expand.mockResolvedValueOnce({ ok: false, refusal: REFUSAL });

    await upload('f-fin', 'lease.pdf');

    expect(container.querySelector('[role=alert]')!.textContent).toBe(REFUSAL);
    expect(container.textContent).not.toContain('Uploaded lease.pdf');
  });
});
