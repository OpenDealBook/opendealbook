// @vitest-environment jsdom
import { act, useState } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MergeFieldPicker } from './merge-field-picker';

let container: HTMLDivElement;
let root: Root;

function Host({ tokens, initial }: { tokens: string[]; initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <textarea id={'body'} value={value} onChange={(event) => setValue(event.target.value)} />
      <MergeFieldPicker fieldId={'body'} tokens={tokens} value={value} onChange={setValue} />
    </>
  );
}

async function render(tokens: string[], initial = '') {
  await act(async () => {
    root.render(<Host tokens={tokens} initial={initial} />);
  });
}

function body() {
  return container.querySelector('textarea')!;
}

async function openMenu() {
  await act(async () => {
    container
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

async function choose(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent === label,
  )!;
  await act(async () => {
    item.click();
  });
  await settleFocus();
}

async function settleFocus() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('MergeFieldPicker', () => {
  it('lists the given fields by plain label under their group', async () => {
    await render(['firm.name', 'firm.city', 'sender.name']);

    expect(container.querySelector('button')!.textContent).toBe('Insert field');
    await openMenu();

    const menu = document.querySelector('[role="menu"]')!;
    expect([...menu.children].map((group) => [...group.children].map((node) => node.textContent))).toEqual([
      ['Firm', 'Firm name', 'Firm city'],
      ['Sender', 'Sender name'],
    ]);
  });

  it('replaces the selection with the token and puts the caret after it', async () => {
    await render(['firm.name'], 'Hi there, friend');
    body().setSelectionRange(3, 8);

    await openMenu();
    await choose('Firm name');

    expect(body().value).toBe('Hi {{ firm.name }}, friend');
    expect(document.activeElement).toBe(body());
    expect(body().selectionStart).toBe(18);
    expect(body().selectionEnd).toBe(18);
  });

  it('leaves the text alone and returns to the button when closed without a choice', async () => {
    await render(['firm.name'], 'Hi there');
    body().setSelectionRange(3, 3);

    await openMenu();
    await act(async () => {
      document
        .querySelector('[role="menu"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settleFocus();

    expect(body().value).toBe('Hi there');
    expect(document.activeElement).toBe(container.querySelector('button'));
  });
});
