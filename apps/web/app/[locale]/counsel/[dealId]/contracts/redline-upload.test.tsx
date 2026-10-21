// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ upload: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/contracts/server', () => ({
  uploadCounselRedline: server.upload,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { RedlineUpload } from './redline-upload';

let container: HTMLDivElement;
let root: Root;

const bytes = new Uint8Array([80, 75, 3, 4]);

function field(label: string) {
  const labelled = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )!;

  return container.querySelector<HTMLInputElement>(`#${labelled.htmlFor}`)!;
}

function picker() {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function button(name: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === name,
  );
}

function render() {
  act(() =>
    root.render(<RedlineUpload dealId={'deal-1'} contractId={'contract-1'} />),
  );
}

function choose() {
  const file = new File([bytes], 'redline.docx');
  Object.defineProperty(picker(), 'files', { value: [file] });
  act(() => picker().dispatchEvent(new Event('change', { bubbles: true })));
}

async function upload(summary: string) {
  render();
  choose();
  const summaryField = field('What changed (optional)');
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(summaryField, summary);
    summaryField.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await act(async () => button('Upload redline')!.click());
}

beforeEach(() => {
  server.upload.mockReset();
  server.upload.mockResolvedValue({ ok: true });
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

describe('RedlineUpload', () => {
  it('offers a button to choose Word files only, not the raw browser control', () => {
    render();

    expect(button('Choose redline (.docx)')).toBeDefined();
    expect(picker().hidden).toBe(true);
    expect(picker().accept).toBe('.docx');
  });

  it('names the chosen file', () => {
    render();
    choose();

    expect(container.textContent).toContain('redline.docx');
  });

  it('uploads the chosen file with what changed', async () => {
    await upload('Tightened indemnity');

    expect(server.upload).toHaveBeenCalledWith({
      dealId: 'deal-1',
      contractId: 'contract-1',
      docxBytes: bytes,
      changeSummary: 'Tightened indemnity',
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('sends no summary when none is given', async () => {
    await upload('');

    expect(server.upload).toHaveBeenCalledWith(
      expect.objectContaining({ changeSummary: undefined }),
    );
  });

  it('says why when the upload is refused', async () => {
    server.upload.mockResolvedValue({
      ok: false,
      refusal: 'Upload the redline as a Word (.docx) file.',
    });

    await upload('');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Upload the redline as a Word (.docx) file.',
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });
});
