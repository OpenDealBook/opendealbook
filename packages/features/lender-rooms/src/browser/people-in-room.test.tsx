// @vitest-environment jsdom
import { act } from 'react';

import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { PeopleInRoom } from './people-in-room';

function shown(
  people: {
    user_id: string;
    email: string;
    name: string | null;
    has_signed_in?: boolean;
  }[],
  viewerId: string,
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const container = document.createElement('div');
  const root = createRoot(container);

  act(() =>
    root.render(
      <PeopleInRoom
        people={people.map((person) => ({ has_signed_in: true, ...person }))}
        viewerId={viewerId}
      />,
    ),
  );

  const result = {
    heading: container.querySelector('h2')!.textContent,
    people: [...container.querySelectorAll('li')].map((person) =>
      [...person.querySelectorAll('span')].map((line) => line.textContent),
    ),
  };

  act(() => root.unmount());
  vi.unstubAllGlobals();

  return result;
}

it('puts the viewer first, then everyone else by name or by email when there is no name', () => {
  expect(
    shown(
      [
        { user_id: 'zed', email: 'zed@firstharbor.test', name: 'Zed Quinn' },
        { user_id: 'ana', email: 'ana@firstharbor.test', name: 'Ana Ruiz' },
        { user_id: 'bo', email: 'bo@firstharbor.test', name: null },
        { user_id: 'cy', email: 'cy@firstharbor.test', name: 'Cy Adams' },
      ],
      'ana',
    ),
  ).toEqual({
    heading: 'People in this room',
    people: [
      ['Ana Ruiz (you)', 'ana@firstharbor.test'],
      ['bo@firstharbor.test'],
      ['Cy Adams', 'cy@firstharbor.test'],
      ['Zed Quinn', 'zed@firstharbor.test'],
    ],
  });
});

it('names the viewer by email when they have no name', () => {
  expect(
    shown([{ user_id: 'bo', email: 'bo@firstharbor.test', name: null }], 'bo')
      .people,
  ).toEqual([['bo@firstharbor.test (you)']]);
});

it('says who has not signed in yet, but never about the viewer', () => {
  expect(
    shown(
      [
        { user_id: 'ana', email: 'ana@firstharbor.test', name: 'Ana Ruiz', has_signed_in: false },
        { user_id: 'bo', email: 'bo@firstharbor.test', name: null, has_signed_in: false },
        { user_id: 'cy', email: 'cy@firstharbor.test', name: 'Cy Adams', has_signed_in: false },
      ],
      'ana',
    ).people,
  ).toEqual([
    ['Ana Ruiz (you)', 'ana@firstharbor.test'],
    ['bo@firstharbor.test', 'Invited, not signed in yet'],
    ['Cy Adams', 'cy@firstharbor.test', 'Invited, not signed in yet'],
  ]);
});
