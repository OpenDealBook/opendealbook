// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/outreach-app/server', () => ({ setOutreachSetting: server.save }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: server.refresh }) }));

import { SettingsForm } from './settings-form';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server.save.mockReset().mockResolvedValue({ success: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('the outreach settings form', () => {
  it('saves an empty max touches as 3', async () => {
    await act(async () => {
      root.render(<SettingsForm accountId={'team-1'} dailyCap={25} maxTouches={5} />);
    });
    const touches = container.querySelector<HTMLInputElement>('#max-touches')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(touches, '');
      touches.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(touches.required).toBe(false);
    expect(touches.placeholder).toBe('3');

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(server.save).toHaveBeenCalledWith({ accountId: 'team-1', dailyCap: 25, maxTouches: 3 });
  });
});
