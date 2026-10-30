// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  begin: vi.fn(),
  upload: vi.fn(),
  parse: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@odb/templates/server', () => ({
  beginTemplateUpload: server.begin,
  parseTemplateDocx: server.parse,
  saveTemplate: server.save,
}));

vi.mock('@odb/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: server.upload }) },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { TemplateAuthoring } from './template-authoring';

let container: HTMLDivElement;
let root: Root;

function input(id: string) {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}

function typeName(value: string) {
  const field = input('template-name');
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;

  act(() => {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function uploadDocx() {
  const field = input('template-file');
  const file = new File(['docx'], 'extension.docx');

  Object.defineProperty(field, 'files', { value: [file] });

  await act(async () => {
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function chooseType(label: string) {
  const trigger = input('template-type');

  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });

  const option = [...document.querySelectorAll('[role="option"]')].find(
    (candidate) => candidate.textContent === label,
  )!;

  await act(async () => {
    option.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

async function save() {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Save template',
  )!;

  await act(async () => {
    button.click();
  });
}

function alertText() {
  return container.querySelector('[role="alert"]')?.textContent;
}

beforeEach(() => {
  server.begin.mockReset();
  server.upload.mockReset();
  server.parse.mockReset();
  server.save.mockReset();
  server.begin.mockResolvedValue({
    ok: true,
    value: { templateId: 'template-1', path: 'account-1/template-1/v1.docx', token: 't' },
  });
  server.upload.mockResolvedValue({ data: {}, error: null });
  server.save.mockResolvedValue({ ok: true, value: { id: 'template-1' } });
  server.parse.mockResolvedValue({
    ok: true,
    value: [
    {
      key: 'extends_to',
      label: 'Extends to',
      type: 'date',
      source: 'manual',
      source_path: null,
      format: null,
      required: true,
      sort_order: 0,
    },
    ],
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <TemplateAuthoring
        accountId={'account-1'}
        listHref={'/home/acme/settings/templates'}
      />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('TemplateAuthoring', () => {
  it('saves a template as an LOI extension', async () => {
    typeName('Standard extension');
    await uploadDocx();
    await chooseType('LOI extension');
    await save();

    expect(server.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        name: 'Standard extension',
        type: 'loi_extension',
        templateId: 'template-1',
      }),
    );
  });

  it('shows the refusal when the template is too large to upload', async () => {
    server.begin.mockResolvedValue({
      ok: false,
      refusal: 'This template is over 25 MB',
    });

    await uploadDocx();

    expect(alertText()).toBe('This template is over 25 MB');
    expect(server.upload).not.toHaveBeenCalled();
  });

  it('shows why the upload to storage failed', async () => {
    server.upload.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Failed to fetch'), { statusCode: '500' }),
    });

    await uploadDocx();

    expect(alertText()).toBe('Failed to fetch');
  });

  it('says the template is too large when storage rejects its size', async () => {
    server.upload.mockResolvedValue({
      data: null,
      error: Object.assign(
        new Error('The object exceeded the maximum allowed size'),
        { statusCode: '413' },
      ),
    });

    await uploadDocx();

    expect(alertText()).toBe('This template is over 25 MB');
  });

  it('shows why the file could not be parsed', async () => {
    server.parse.mockResolvedValue({
      ok: false,
      refusal: 'Templates must be Word .docx files',
    });

    await uploadDocx();

    expect(alertText()).toBe('Templates must be Word .docx files');
  });

  it('shows why saving was refused', async () => {
    server.save.mockResolvedValue({
      ok: false,
      refusal: 'Only deal managers can save templates. Ask a deal manager.',
    });
    typeName('Standard extension');
    await uploadDocx();
    await save();

    expect(alertText()).toBe('Only deal managers can save templates. Ask a deal manager.');
  });

  it('shows why saving failed', async () => {
    server.save.mockRejectedValue(new Error('Saving the template failed'));
    typeName('Standard extension');
    await uploadDocx();
    await save();

    expect(alertText()).toBe('Saving the template failed');
  });
});
