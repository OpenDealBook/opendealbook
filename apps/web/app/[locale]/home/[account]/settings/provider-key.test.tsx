// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ save: vi.fn(), disconnect: vi.fn(), refresh: vi.fn() }));

vi.mock('./provider-key-actions', () => ({
  saveProviderKeyAction: server.save,
  disconnectProviderKeyAction: server.disconnect,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));
vi.mock('../../../../../config/app.config', () => ({ default: { url: 'https://app.odb.test' } }));

import { ProviderKeySetting } from './provider-key';

let container: HTMLDivElement;
let root: Root;

type Props = Parameters<typeof ProviderKeySetting>[0];

async function render(props: Omit<Props, 'accountId'>) {
  await act(async () => {
    root.render(<ProviderKeySetting accountId={'team-1'} {...props} />);
  });
}

function field(text: string) {
  const label = [...container.querySelectorAll('label')].find((candidate) => candidate.textContent === text);
  return (label?.control ?? null) as HTMLInputElement | null;
}

async function type(label: string, value: string) {
  await act(async () => {
    const element = field(label)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function save() {
  await act(async () => {
    container.querySelector('form')!.requestSubmit();
  });
}

function button(label: string, scope: ParentNode = container) {
  return [...scope.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.save.mockReset().mockResolvedValue({ ok: true, value: undefined });
  server.disconnect.mockReset().mockResolvedValue({ ok: true, value: undefined });
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

describe('the email lookup key setting', () => {
  it('saves the Apify key and actor a settings manager enters, then clears the key field', async () => {
    await render({ kind: 'email_lookup', current: null, canManage: true });

    expect(field('Lob webhook secret')).toBeNull();

    await type('Apify API key', 'apify-new');
    await type('Apify actor', 'acme~site-contacts');
    await save();

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      kind: 'email_lookup',
      apiKey: 'apify-new',
      actorId: 'acme~site-contacts',
    });
    expect(field('Apify API key')!.value).toBe('');
  });

  it('shows the saved actor, never the saved key', async () => {
    await render({ kind: 'email_lookup', current: { actorId: 'acme~site-contacts' }, canManage: true });

    expect(field('Apify actor')!.value).toBe('acme~site-contacts');
    expect(field('Apify API key')!.value).toBe('');
    expect(field('Apify API key')!.type).toBe('password');
    expect(field('Apify API key')!.placeholder).toBe('Saved. Paste a new key to replace it');
  });

  it('shows other members the provider and actor, with nothing to change', async () => {
    await render({ kind: 'email_lookup', current: { actorId: 'acme~site-contacts' }, canManage: false });

    expect(container.textContent).toContain('Connected to Apify, actor acme~site-contacts');
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows why a save was refused', async () => {
    server.save.mockResolvedValue({ ok: false, refusal: 'Paste an API key' });
    await render({ kind: 'email_lookup', current: null, canManage: true });

    await save();

    expect(container.querySelector('[role=alert]')?.textContent).toBe('Paste an API key');
  });
});

describe('the letters key setting', () => {
  it('saves only the Lob key', async () => {
    await render({ kind: 'letters', current: null, canManage: true });

    expect(field('Apify actor')).toBeNull();

    await type('Lob API key', 'lob-new');
    await save();

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      kind: 'letters',
      apiKey: 'lob-new',
      actorId: '',
      webhookSecret: '',
    });
  });

  it('saves the Lob webhook secret beside the key, then clears it', async () => {
    await render({ kind: 'letters', current: { actorId: null }, canManage: true });

    await type('Lob webhook secret', 'hook-secret');
    await save();

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      kind: 'letters',
      apiKey: '',
      actorId: '',
      webhookSecret: 'hook-secret',
    });
    expect(field('Lob webhook secret')!.value).toBe('');
    expect(field('Lob webhook secret')!.type).toBe('password');
  });

  it('shows the webhook address to paste into Lob', async () => {
    await render({ kind: 'letters', current: { actorId: null }, canManage: true });

    expect(container.textContent).toContain('https://app.odb.test/api/webhooks/lob/team-1');
  });

  it('asks a settings manager to confirm before disconnecting', async () => {
    await render({ kind: 'letters', current: { actorId: null }, canManage: true });

    await act(async () => button('Disconnect')!.click());
    const dialog = document.body.querySelector('[role=dialog]')!;

    expect(dialog.textContent).toContain('Disconnect Lob?');
    expect(dialog.textContent).toContain('Letter steps in workflows will fail until you connect it again.');
    expect(server.disconnect).not.toHaveBeenCalled();

    await act(async () => button('Disconnect', dialog)!.click());

    expect(server.disconnect).toHaveBeenCalledWith({ accountId: 'team-1', kind: 'letters' });
  });

  it('tells other members when Lob is not connected', async () => {
    await render({ kind: 'letters', current: null, canManage: false });

    expect(container.textContent).toContain('Not connected');
  });
});
