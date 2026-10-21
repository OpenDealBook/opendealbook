// @vitest-environment jsdom
import { act } from 'react';

import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ decide: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: server.refresh }),
}));

import { ContractReview } from './contract-review';

let container: HTMLDivElement;
let root: Root;

function button(text: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text,
  )!;
}

async function answer(choice: string, note: string) {
  act(() =>
    root.render(
      <ContractReview
        contractVersionId={'v1'}
        review={{ requests: [], decisions: [] }}
        decide={server.decide}
        redlineUpload
      />,
    ),
  );
  const noteField = container.querySelector('textarea')!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(noteField, note);
    noteField.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await act(async () => button(choice).click());
}

beforeEach(() => {
  server.decide.mockReset();
  server.decide.mockResolvedValue({ ok: true });
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

describe('ContractReview', () => {
  it('asks for changes on the version with the note', async () => {
    await answer('Changes needed', 'Cap the indemnity');

    expect(server.decide).toHaveBeenCalledWith({
      contractVersionId: 'v1',
      decision: 'changes_needed',
      note: 'Cap the indemnity',
    });
    expect(server.refresh).toHaveBeenCalled();
  });

  it('approves with comments', async () => {
    await answer('Approve with comments', 'Fine once dates match');

    expect(server.decide).toHaveBeenCalledWith({
      contractVersionId: 'v1',
      decision: 'approved_with_comments',
      note: 'Fine once dates match',
    });
  });

  it('approves without a note when none is written', async () => {
    await answer('Approve', '');

    expect(server.decide).toHaveBeenCalledWith({
      contractVersionId: 'v1',
      decision: 'approved',
      note: undefined,
    });
  });

  it('says why when the answer is refused', async () => {
    server.decide.mockResolvedValue({
      ok: false,
      refusal: 'Your counsel signs off on this contract for you.',
    });

    await answer('Approve', '');

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Your counsel signs off on this contract for you.',
    );
    expect(server.refresh).not.toHaveBeenCalled();
  });
});
