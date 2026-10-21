// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ adopt: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/contracts/server', () => ({
  adoptContractVersion: server.adopt,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { ContractAdoptControl } from './contract-adopt-control';

let container: HTMLDivElement;
let root: Root;

function render(current: boolean) {
  act(() =>
    root.render(
      <ContractAdoptControl
        contractVersionId={'version-2'}
        current={current}
      />,
    ),
  );
}

beforeEach(() => {
  server.adopt.mockReset();
  server.adopt.mockResolvedValue({ ok: true, value: undefined });
  server.refresh.mockReset();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ContractAdoptControl', () => {
  it('makes a version current with one click', async () => {
    render(false);
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('Make current');

    await act(async () => button.click());

    expect(server.adopt).toHaveBeenCalledWith({
      contractVersionId: 'version-2',
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('marks the current version and offers no button', () => {
    render(true);

    expect(container.textContent).toBe('Current');
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows why the version could not be made current', async () => {
    server.adopt.mockResolvedValue({
      ok: false,
      refusal:
        'Only deal managers can change the current contract version. Ask a deal manager.',
    });
    render(false);

    await act(async () => container.querySelector('button')!.click());

    expect(container.querySelector('[role=alert]')!.textContent).toBe(
      'Only deal managers can change the current contract version. Ask a deal manager.',
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });
});
