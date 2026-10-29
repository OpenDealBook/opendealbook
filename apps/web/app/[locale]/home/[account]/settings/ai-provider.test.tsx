// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ save: vi.fn(), disconnect: vi.fn(), refresh: vi.fn() }));

vi.mock('./ai-provider-actions', () => ({
  saveAiProviderAction: server.save,
  disconnectAiProviderAction: server.disconnect,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { AiProviderSetting } from './ai-provider';

let container: HTMLDivElement;
let root: Root;

const CONNECTED = {
  provider: 'anthropic',
  model: 'claude-sonnet',
  embeddingModel: 'voyage-3' as string | null,
  baseUrl: 'https://api.anthropic.com/v1',
};

async function render(props: { current: typeof CONNECTED | null; canManage: boolean }) {
  await act(async () => {
    root.render(<AiProviderSetting accountId={'team-1'} {...props} />);
  });
}

function field(label: string) {
  return container.querySelector<HTMLInputElement & HTMLSelectElement>(`[aria-label="${label}"]`);
}

async function type(label: string, value: string) {
  await act(async () => {
    const element = field(label)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function save() {
  await act(async () => {
    container.querySelector('form')!.requestSubmit();
  });
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

describe('the team AI provider setting', () => {
  it('saves the provider, models, base URL and key a settings manager enters', async () => {
    await render({ current: null, canManage: true });

    await type('Provider', 'openai_compatible');
    await type('Model', 'llama-3');
    await type('Embedding model', 'nomic-embed-text');
    await type('Base URL', 'https://llm.example.test/v1');
    await type('API key', 'sk-new');
    await save();

    expect(server.save).toHaveBeenCalledWith({
      accountId: 'team-1',
      provider: 'openai_compatible',
      model: 'llama-3',
      embeddingModel: 'nomic-embed-text',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'sk-new',
    });
    expect(field('API key')!.value).toBe('');
  });

  it('starts from the saved embedding model', async () => {
    await render({ current: { ...CONNECTED, provider: 'openai' }, canManage: true });

    expect(field('Embedding model')!.value).toBe('voyage-3');
  });

  it('explains that embeddings need an OpenAI or OpenAI-compatible provider', async () => {
    await render({ current: null, canManage: true });

    expect(container.textContent).toContain(
      'Document search needs an embedding model from OpenAI or an OpenAI-compatible endpoint. Anthropic has none.',
    );
  });

  it('hides the embedding model for Anthropic and clears it, so a save sends none', async () => {
    await render({ current: null, canManage: true });

    await type('Provider', 'openai');
    await type('Embedding model', 'text-embedding-3-small');
    await type('Provider', 'anthropic');

    expect(field('Embedding model')).toBeNull();

    await type('Model', 'claude-sonnet');
    await save();

    expect(server.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', embeddingModel: '' }));
  });

  it('sends no embedding model for a saved Anthropic provider that still has one', async () => {
    await render({ current: CONNECTED, canManage: true });

    await save();

    expect(server.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', embeddingModel: '' }));
  });

  it('starts empty when no embedding model is saved', async () => {
    await render({ current: { ...CONNECTED, provider: 'openai', embeddingModel: null }, canManage: true });

    expect(field('Embedding model')!.value).toBe('');
  });

  it('asks for a base URL only for an OpenAI-compatible endpoint', async () => {
    await render({ current: CONNECTED, canManage: true });

    expect(field('Base URL')).toBeNull();

    await type('Provider', 'openai_compatible');

    expect(field('Base URL')).not.toBeNull();
  });

  it('never shows a stored key, only offers to replace it', async () => {
    await render({ current: CONNECTED, canManage: true });

    expect(field('API key')!.value).toBe('');
    expect(field('API key')!.type).toBe('password');
    expect(field('API key')!.placeholder).toBe('Saved. Paste a new key to replace it');
  });

  it('shows why a save was refused', async () => {
    server.save.mockResolvedValue({ ok: false, refusal: 'Paste an API key' });
    await render({ current: null, canManage: true });

    await type('Model', 'gpt-4.1');
    await save();

    expect(container.querySelector('[role=alert]')?.textContent).toBe('Paste an API key');
  });

  it('shows other members the provider and model, with nothing to change', async () => {
    await render({ current: CONNECTED, canManage: false });

    expect(container.textContent).toContain('Anthropic');
    expect(container.textContent).toContain('claude-sonnet');
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('tells other members when no provider is connected', async () => {
    await render({ current: null, canManage: false });

    expect(container.textContent).toContain('No AI provider connected');
  });

  it('asks a settings manager to confirm before disconnecting', async () => {
    await render({ current: CONNECTED, canManage: true });

    await act(async () => disconnectButton()!.click());

    const dialog = document.body.querySelector('[role=dialog]');
    expect(dialog?.textContent).toContain('Disconnect the AI provider?');
    expect(dialog?.textContent).toContain(
      'AI steps in workflows will fail until you connect one again.',
    );
    expect(server.disconnect).not.toHaveBeenCalled();

    await act(async () => dialogButton('Disconnect')!.click());

    expect(server.disconnect).toHaveBeenCalledWith({ accountId: 'team-1' });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('keeps the provider connected when the manager cancels', async () => {
    await render({ current: CONNECTED, canManage: true });

    await act(async () => disconnectButton()!.click());
    await act(async () => dialogButton('Cancel')!.click());

    expect(server.disconnect).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role=dialog]')).toBeNull();
  });

  it('offers no disconnect when nothing is connected or the member cannot manage settings', async () => {
    await render({ current: null, canManage: true });
    expect(disconnectButton()).toBeUndefined();

    await render({ current: CONNECTED, canManage: false });
    expect(disconnectButton()).toBeUndefined();
  });
});

function disconnectButton() {
  return [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Disconnect',
  );
}

function dialogButton(label: string) {
  return [...document.body.querySelectorAll('[role=dialog] button')].find(
    (button) => button.textContent === label,
  ) as HTMLButtonElement | undefined;
}
