// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const asked = vi.hoisted(() => [] as unknown[]);

vi.mock('../uploads/folder-actions', async () => {
  const { SESSION_ENDED } = await import('../actions/refusal');

  return {
    createFolder: async (input: unknown) => {
      asked.push(input);

      return { ok: false, refusal: SESSION_ENDED };
    },
  };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => '/lender/room',
}));

import { NewFolderDialog } from './new-folder-dialog';

it('sends a person whose session ended to the sign-in path it was given', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const container = document.createElement('div');
  const root = createRoot(container);

  document.body.append(container);
  act(() =>
    root.render(
      <NewFolderDialog
        space={{ roomId: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11' }}
        parentFolderId={'0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22'}
        signInPath={'/auth/sign-in?next=/home'}
        onClose={() => {}}
      />,
    ),
  );

  const field = document.querySelector<HTMLInputElement>('input[name=name]')!;

  field.value = 'Forms';
  await act(async () => field.form!.requestSubmit());

  expect(
    document
      .querySelector('[role=dialog] [role=alert] a')!
      .getAttribute('href'),
  ).toBe('/auth/sign-in?next=/home');
  expect(asked).toEqual([
    {
      roomId: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
      parentFolderId: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22',
      name: 'Forms',
    },
  ]);

  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
