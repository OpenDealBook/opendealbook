// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: server.refresh }) }));
vi.mock('@odb/outreach-app/server', () => ({
  createLetterTemplate: server.create,
  updateLetterTemplate: server.update,
}));

import { LetterTemplatesPanel } from './letter-templates-panel';

const ACCOUNT = 'a0000000-0000-4000-8000-000000000001';
const INTRO = { id: 't-1', name: 'Intro', body: 'Dear owner of {{ firm.name }}' };

let container: HTMLDivElement;
let root: Root;

async function render(templates: (typeof INTRO)[]) {
  await act(async () => {
    root.render(<LetterTemplatesPanel accountId={ACCOUNT} templates={templates} />);
  });
}

function field(text: string) {
  const label = [...container.querySelectorAll('label')].find((candidate) => candidate.textContent === text)!;
  return label.control as HTMLInputElement | HTMLTextAreaElement;
}

async function type(label: string, value: string) {
  const element = field(label);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element) as object, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(text: string) {
  const target = [...container.querySelectorAll('button')].find((button) => button.textContent === text)!;
  await act(async () => {
    target.click();
  });
}

async function save() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.create.mockReset().mockResolvedValue(undefined);
  server.update.mockReset().mockResolvedValue({ ok: true, value: undefined });
  server.refresh.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('LetterTemplatesPanel', () => {
  it('lists the team letter templates', async () => {
    await render([INTRO]);

    expect(container.textContent).toContain('Intro');
    expect(container.textContent).toContain('Dear owner of {{ firm.name }}');
  });

  it('says when there are none', async () => {
    await render([]);

    expect(container.textContent).toContain('No letter templates yet.');
  });

  it('adds a letter template', async () => {
    await render([]);

    await click('New letter template');
    await type('Name', 'Follow-up');
    await type('Letter', 'Writing again');
    await save();

    expect(server.create).toHaveBeenCalledWith({ accountId: ACCOUNT, name: 'Follow-up', body: 'Writing again' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('edits a letter template', async () => {
    await render([INTRO]);

    await click('Edit');
    await type('Letter', 'Dear {{ firm.name }}');
    await save();

    expect(server.update).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      templateId: 't-1',
      name: 'Intro',
      body: 'Dear {{ firm.name }}',
    });
  });

  it('shows why an edit was refused and keeps the form open', async () => {
    server.update.mockResolvedValue({
      ok: false,
      refusal: 'Only deal managers can edit letter templates. Ask a deal manager.',
    });
    await render([INTRO]);

    await click('Edit');
    await save();

    expect(container.textContent).toContain('Only deal managers can edit letter templates. Ask a deal manager.');
    expect(container.querySelector('form')).not.toBeNull();
    expect(server.refresh).not.toHaveBeenCalled();
  });
});
