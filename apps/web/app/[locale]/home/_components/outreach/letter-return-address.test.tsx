// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));

vi.mock('./letter-return-address-actions', () => ({ saveLetterReturnAddressAction: server.save }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: server.refresh }) }));

import { LetterReturnAddress } from './letter-return-address';

const SAVED = { name: 'Harbor Acquisitions', addressLine1: '9 Elm St', city: 'Austin', state: 'TX', postalCode: '78702' };

let container: HTMLDivElement;
let root: Root;

function field(text: string) {
  const label = [...container.querySelectorAll('label')].find((candidate) => candidate.textContent === text)!;
  return label.control as HTMLInputElement;
}

async function render(address: typeof SAVED | null) {
  await act(async () => {
    root.render(<LetterReturnAddress accountId={'team-1'} address={address} />);
  });
}

async function type(label: string, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(field(label), value);
    field(label).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function save() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.save.mockReset().mockResolvedValue({ ok: true });
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

describe('the letter return address setting', () => {
  it('shows the saved return address', async () => {
    await render(SAVED);

    expect(field('Return name').value).toBe('Harbor Acquisitions');
    expect(field('Street address').value).toBe('9 Elm St');
    expect(field('City').value).toBe('Austin');
    expect(field('State').value).toBe('TX');
    expect(field('ZIP code').value).toBe('78702');
  });

  it('says letters wait for a return address', async () => {
    await render(null);

    expect(container.textContent).toContain('Letters are not sent until a return address is set.');
  });

  it('saves the address a deal manager enters', async () => {
    await render(SAVED);

    await type('City', 'Dallas');
    await save();

    expect(server.save).toHaveBeenCalledWith({ accountId: 'team-1', ...SAVED, city: 'Dallas' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('shows why a save was refused', async () => {
    server.save.mockResolvedValue({ ok: false, refusal: 'Changing the return address needs deals.manage' });
    await render(SAVED);

    await save();

    expect(container.querySelector('[role=alert]')?.textContent).toBe(
      'Changing the return address needs deals.manage',
    );
  });
});
