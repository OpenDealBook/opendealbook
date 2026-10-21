// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../server/members-actions', () => ({
  updateMemberRoleAction: async () => undefined,
}));

import { UpdateMemberRoleDialog } from './update-member-role-dialog';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

async function openDialogFor(currentRole: string): Promise<Element> {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);

  document.body.append(container);
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  act(() =>
    root.render(
      <UpdateMemberRoleDialog
        accountId={'0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22'}
        userId={'7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11'}
        currentRole={currentRole}
      />,
    ),
  );
  await act(async () => container.querySelector('button')!.click());

  return document.querySelector('[role=dialog]')!;
}

function shownRole(dialog: Element): string {
  return dialog.querySelector('[role=combobox]')!.textContent!;
}

function save(dialog: Element): HTMLButtonElement {
  return [...dialog.querySelectorAll('button')].find(
    (button) => button.textContent === 'Save',
  )!;
}

it('shows an analyst as the team member role they were merged into', async () => {
  const dialog = await openDialogFor('analyst');

  expect(shownRole(dialog)).toBe('Team member');
  expect(save(dialog).disabled).toBe(false);
});

it('shows a role that cannot be assigned here unchanged and does not save it', async () => {
  const dialog = await openDialogFor('broker');

  expect(shownRole(dialog)).toBe('Broker');
  expect(save(dialog).disabled).toBe(true);
});
