// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  setEnabled: vi.fn(),
  setArchived: vi.fn(),
  runNow: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../[account]/workflows/actions', () => ({
  setWorkflowEnabled: server.setEnabled,
  setWorkflowArchived: server.setArchived,
  runWorkflowNow: server.runNow,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { WorkflowRowActions } from './workflows-list-actions';

let container: HTMLDivElement;
let root: Root;

function render(workflow: { enabled: boolean; archived: boolean }) {
  act(() =>
    root.render(<WorkflowRowActions workflowId={'wf-1'} {...workflow} />),
  );
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )!;
}

beforeEach(() => {
  for (const fn of Object.values(server)) {
    fn.mockReset();
  }
  server.setEnabled.mockResolvedValue({ ok: true, value: undefined });
  server.setArchived.mockResolvedValue({ ok: true, value: undefined });
  server.runNow.mockResolvedValue({ ok: true, value: { runId: 'run-1' } });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('WorkflowRowActions', () => {
  it('enables a disabled workflow and refreshes the list', async () => {
    render({ enabled: false, archived: false });

    await act(async () => button('Enable').click());

    expect(server.setEnabled).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      enabled: true,
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('disables an enabled workflow', async () => {
    render({ enabled: true, archived: false });

    await act(async () => button('Disable').click());

    expect(server.setEnabled).toHaveBeenCalledWith({
      workflowId: 'wf-1',
      enabled: false,
    });
  });

  it('archives and unarchives', async () => {
    render({ enabled: false, archived: false });
    await act(async () => button('Archive').click());

    render({ enabled: false, archived: true });
    await act(async () => button('Unarchive').click());

    expect(server.setArchived.mock.calls).toEqual([
      [{ workflowId: 'wf-1', archived: true }],
      [{ workflowId: 'wf-1', archived: false }],
    ]);
  });

  it('starts a run under a fresh request id per click and refreshes the list', async () => {
    render({ enabled: false, archived: false });

    await act(async () => button('Run now').click());
    await act(async () => button('Run now').click());

    const [first, second] = server.runNow.mock.calls.map(([input]) => input);

    expect(first).toEqual({ workflowId: 'wf-1', requestId: expect.any(String) });
    expect(second.requestId).not.toBe(first.requestId);
    expect(server.refresh).toHaveBeenCalled();
  });

  it('disables Run now while the run is starting', async () => {
    let finish: (value: unknown) => void = () => {};
    server.runNow.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render({ enabled: false, archived: false });

    await act(async () => button('Run now').click());

    expect(button('Run now').disabled).toBe(true);
    expect(server.runNow).toHaveBeenCalledTimes(1);

    await act(async () => finish({ ok: true, value: { runId: 'run-1' } }));

    expect(button('Run now').disabled).toBe(false);
  });

  it('shows the refusal when Run now is refused', async () => {
    server.runNow.mockResolvedValue({
      ok: false,
      refusal: 'Publish this workflow first',
    });
    render({ enabled: false, archived: false });

    await act(async () => button('Run now').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Publish this workflow first',
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });

  it('shows the refusal when enabling is refused', async () => {
    server.setEnabled.mockResolvedValue({
      ok: false,
      refusal: 'Publish this workflow first',
    });
    render({ enabled: false, archived: false });

    await act(async () => button('Enable').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Publish this workflow first',
    );
  });
});
