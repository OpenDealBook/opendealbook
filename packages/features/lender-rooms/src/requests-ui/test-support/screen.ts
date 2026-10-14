import { type ReactNode, act } from 'react';

import { type Root, createRoot } from 'react-dom/client';

type Field = HTMLInputElement | HTMLTextAreaElement;

let root: Root | undefined;
let container: HTMLElement | undefined;

export function show(ui: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(ui));
}

export function clearScreen() {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
}

function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function labelled<Kind extends Element>(selector: string, name: string) {
  return [...document.querySelectorAll<Kind>(selector)].filter(
    (element) =>
      element.getAttribute('aria-label') === name ||
      (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
        ? [...(element.labels ?? [])].some(
            (label) => textOf(label) === name || textOf(label).startsWith(name),
          )
        : textOf(element) === name),
  );
}

export function fields(name: string): Field[] {
  return labelled<Field>('input, textarea', name);
}

export function field(name: string): Field {
  const [found] = fields(name);

  if (!found) {
    throw new Error(`No field labelled "${name}"`);
  }

  return found;
}

export function buttons(name: string): HTMLButtonElement[] {
  return labelled<HTMLButtonElement>('button', name);
}

export function button(name: string): HTMLButtonElement {
  const [found] = buttons(name);

  if (!found) {
    throw new Error(`No button named "${name}"`);
  }

  return found;
}

export function buttonNames(): string[] {
  return [...(container?.querySelectorAll('button') ?? [])].map(
    (each) => each.getAttribute('aria-label') ?? textOf(each),
  );
}

export async function press(name: string) {
  await act(async () => {
    button(name).click();
  });
}

export async function type(name: string, value: string) {
  const target = field(name);
  const prototype =
    target instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;

  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(
      target,
      value,
    );
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export async function choose(name: string) {
  await act(async () => {
    field(name).click();
  });
}

export async function key(
  name: string,
  init: KeyboardEventInit & { key: string },
) {
  await act(async () => {
    field(name).dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  });
}

export async function submit(name: string) {
  await act(async () => {
    field(name).form!.requestSubmit();
  });
}

export async function attach(name: string, ...fileNames: string[]) {
  const input = field(name);

  Object.defineProperty(input, 'files', {
    configurable: true,
    value: fileNames.map((fileName) => new File(['x'], fileName)),
  });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function alerts(): string[] {
  return [...document.querySelectorAll('[role="alert"]')].map(textOf);
}

export function announced(): string[] {
  return [...document.querySelectorAll('[role="status"]')]
    .map(textOf)
    .filter(Boolean);
}

export function dialogText(): string | null {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const top = dialogs.at(-1);

  return top ? textOf(top) : null;
}

export function pageText(): string {
  return textOf(document.body);
}
