// @vitest-environment jsdom
import { act, useLayoutEffect, useState } from 'react';

import { afterEach, expect, it, vi } from 'vitest';

import { UnsavedChangesGuard } from './calc-shared';
import { clearScreen, dialogText, show } from './lender-test-kit';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

afterEach(() => {
  clearScreen();
});

let edit: () => void;

function EditorThatClicksHomeAsSoonAsTheEditPaints(props: {
  clicked: (event: MouseEvent) => void;
}) {
  const [dirty, setDirty] = useState(false);
  edit = () => setDirty(true);

  useLayoutEffect(() => {
    if (!dirty) {
      return;
    }
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('a')!.dispatchEvent(event);
    props.clicked(event);
  }, [dirty, props]);

  return (
    <>
      <UnsavedChangesGuard dirty={dirty} />
      <a href={'/home/acme'}>Home</a>
    </>
  );
}

it('asks before following a link clicked right after the first edit, before effects run', () => {
  const clicks: MouseEvent[] = [];
  show(
    <EditorThatClicksHomeAsSoonAsTheEditPaints
      clicked={(event) => clicks.push(event)}
    />,
  );

  act(() => edit());

  expect(clicks.map((click) => click.defaultPrevented)).toEqual([true]);
  expect(dialogText()).toContain('Discard unsaved changes?');
});
