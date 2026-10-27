// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: server.refresh }) }));
vi.mock('@odb/outreach-app/server', () => ({
  createSequence: server.create,
  seedDefaultSequences: vi.fn(),
  updateSequence: server.update,
}));

import { SequencesPanel, type Sequence } from './sequences-panel';

const ACCOUNT = 'a0000000-0000-4000-8000-000000000001';

const MIXED: Sequence = {
  id: 's-1',
  name: 'Letter then email',
  description: null,
  enabled: true,
  isDefault: false,
  steps: [
    { ordinal: 1, delayDays: 0, channel: 'letter', subject: null, body: 'Letter body' },
    { ordinal: 2, delayDays: 7, channel: 'email', subject: 'Quick question', body: 'Email body' },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function render(sequences: Sequence[]) {
  await act(async () => {
    root.render(<SequencesPanel accountId={ACCOUNT} sequences={sequences} />);
  });
}

function field(text: string, step?: number) {
  const scope =
    step === undefined
      ? container
      : [...container.querySelectorAll('fieldset')].find(
          (fieldset) => fieldset.querySelector('legend')?.textContent === `Step ${step}`,
        )!;
  const label = [...scope.querySelectorAll('label')].find((candidate) => candidate.textContent === text);
  return (label?.control ?? null) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
}

async function type(label: string, value: string, step?: number) {
  const element = field(label, step)!;
  const prototype = Object.getPrototypeOf(element) as object;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
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
  server.create.mockReset().mockResolvedValue('new-id');
  server.update.mockReset().mockResolvedValue('s-1');
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

describe('SequencesPanel', () => {
  it('lists each step as a letter or by its email subject, with its delay', async () => {
    await render([MIXED]);

    expect(container.textContent).toContain('Letter');
    expect(container.textContent).toContain('Letter body');
    expect(container.textContent).toContain('Quick question');
    expect(container.textContent).toContain('7 days later');
    expect(container.textContent).not.toContain("can't be edited");
  });

  it('edits a sequence holding a letter step and saves every step', async () => {
    await render([MIXED]);

    await click('Edit');
    expect(field('Subject', 1)).toBeNull();
    await type('Days after the step before', '10', 2);
    await type('Letter', 'New letter body', 1);
    await save();

    expect(server.update).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      sequenceId: 's-1',
      name: 'Letter then email',
      description: '',
      steps: [
        { ordinal: 1, delayDays: 0, channel: 'letter', body: 'New letter body' },
        { ordinal: 2, delayDays: 10, channel: 'email', subject: 'Quick question', body: 'Email body' },
      ],
    });
  });

  it('builds a new sequence touch by touch', async () => {
    await render([]);

    await click('New sequence');
    await type('Name', 'Letter first');
    await type('Channel', 'letter', 1);
    await type('Letter', 'Dear owner', 1);
    await click('Add step');
    await type('Days after the step before', '7', 2);
    await type('Subject', 'Following up', 2);
    await type('Body', 'Hi again', 2);
    await save();

    expect(server.create).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      name: 'Letter first',
      description: '',
      steps: [
        { ordinal: 1, delayDays: 0, channel: 'letter', body: 'Dear owner' },
        { ordinal: 2, delayDays: 7, channel: 'email', subject: 'Following up', body: 'Hi again' },
      ],
    });
  });

  it('removes a step', async () => {
    await render([MIXED]);

    await click('Edit');
    await click('Remove step 1');
    await save();

    expect(server.update).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [{ ordinal: 1, delayDays: 7, channel: 'email', subject: 'Quick question', body: 'Email body' }],
      }),
    );
  });
});
