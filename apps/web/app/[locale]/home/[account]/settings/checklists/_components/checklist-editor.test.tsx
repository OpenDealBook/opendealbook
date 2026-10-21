// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@odb/diligence/server', () => ({
  addTemplateItem: vi.fn(),
  createChecklistTemplate: vi.fn(),
  removeTemplateItem: vi.fn(),
  renameChecklistTemplate: vi.fn(),
  reorderTemplateItems: vi.fn(),
  setDefaultChecklistTemplate: vi.fn(),
  updateTemplateItem: vi.fn(),
}));

import { ChecklistEditor } from './checklist-editor';

const templates = [
  {
    id: 't1',
    name: 'Standard Closing',
    kind: 'closing',
    is_default: true,
    items: [
      {
        id: 'i1',
        title: 'Payoff letters',
        category: 'Lien',
        due_offset_days: -5,
        review_offset_days: 3,
        owner_role: 'attorney',
        importance: 'required',
      },
    ],
  },
  {
    id: 't2',
    name: 'Light Closing',
    kind: 'closing',
    is_default: false,
    items: [],
  },
];

let container: HTMLDivElement;
let root: Root;

function render(canManage: boolean) {
  act(() => {
    root.render(
      <ChecklistEditor
        accountId={'a1'}
        canManage={canManage}
        templates={templates}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the checklist editor', () => {
  it('shows a member without checklists.manage the templates and no edit controls', () => {
    render(false);

    expect(container.textContent).toContain('Standard Closing');
    expect(container.textContent).toContain('Payoff letters');
    expect(container.textContent).toContain('5 days before close');
    expect(container.querySelectorAll('button, input')).toHaveLength(0);
  });

  it('gives a manager the edit controls', () => {
    render(true);

    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
  });

  it('lists each item as one compact row with no fields until it is edited', () => {
    render(true);

    const rows = [...container.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')]
        .slice(0, 6)
        .map((cell) => cell.textContent),
    );

    expect(rows).toEqual([
      [
        'Payoff letters',
        'Lien',
        '5 days before close',
        '3',
        'attorney',
        'required',
      ],
    ]);
    expect(
      container.querySelectorAll('input[aria-label="Title"]'),
    ).toHaveLength(0);
  });

  it('opens an item for editing in place', () => {
    render(true);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Edit Payoff letters"]',
        )!
        .click();
    });

    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Title"]')!
        .value,
    ).toBe('Payoff letters');
  });

  it('offers Make default only on a template that is not already the default', () => {
    render(true);

    const labels = [...container.querySelectorAll('button')].map(
      (button) => button.textContent,
    );

    expect(labels.filter((label) => label === 'Make default')).toHaveLength(1);
  });
});
