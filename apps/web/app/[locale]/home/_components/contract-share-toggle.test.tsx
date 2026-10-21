// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ share: vi.fn(), refresh: vi.fn() }));

vi.mock('@odb/contracts/server', () => ({
  setContractVersionShared: server.share,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { ContractShareToggle } from './contract-share-toggle';

let container: HTMLDivElement;
let root: Root;

function render(shared: boolean) {
  act(() =>
    root.render(
      <ContractShareToggle contractVersionId={'version-1'} shared={shared} />,
    ),
  );

  return container.querySelector('button')!;
}

beforeEach(() => {
  server.share.mockReset();
  server.share.mockResolvedValue({ ok: true });
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

describe('ContractShareToggle', () => {
  it('shares an unshared version with the seller side', async () => {
    const button = render(false);

    expect(button.textContent).toBe('Share with seller side');

    await act(async () => button.click());

    expect(server.share).toHaveBeenCalledWith({
      contractVersionId: 'version-1',
      shared: true,
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('takes a shared version back', async () => {
    const button = render(true);

    expect(button.textContent).toBe('Stop sharing');

    await act(async () => button.click());

    expect(server.share).toHaveBeenCalledWith({
      contractVersionId: 'version-1',
      shared: false,
    });
  });

  it('says why when the share is refused', async () => {
    server.share.mockResolvedValue({
      ok: false,
      refusal: "You can't share contracts.",
    });
    const button = render(false);

    await act(async () => button.click());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "You can't share contracts.",
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });
});
