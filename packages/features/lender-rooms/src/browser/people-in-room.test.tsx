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
        {
          user_id: 'zed',
          email: 'zed@bluefintestlending.test',
          name: 'Zed Quinn',
        },
        {
          user_id: 'ana',
          email: 'ana@bluefintestlending.test',
          name: 'Ana Ruiz',
        },
        { user_id: 'bo', email: 'bo@bluefintestlending.test', name: null },
        {
          user_id: 'cy',
          email: 'cy@bluefintestlending.test',
          name: 'Cy Adams',
        },
      ],
      'ana',
    ),
  ).toEqual({
    heading: 'People in this room',
    people: [
      ['Ana Ruiz (you)', 'ana@bluefintestlending.test'],
      ['bo@bluefintestlending.test'],
      ['Cy Adams', 'cy@bluefintestlending.test'],
      ['Zed Quinn', 'zed@bluefintestlending.test'],
    ],
  });
});

it('names the viewer by email when they have no name', () => {
  expect(
    shown(
      [{ user_id: 'bo', email: 'bo@bluefintestlending.test', name: null }],
      'bo',
    ).people,
  ).toEqual([['bo@bluefintestlending.test (you)']]);
});

it('says who has not signed in yet, but never about the viewer', () => {
  expect(
    shown(
      [
        {
          user_id: 'ana',
          email: 'ana@bluefintestlending.test',
          name: 'Ana Ruiz',
          has_signed_in: false,
        },
        {
          user_id: 'bo',
          email: 'bo@bluefintestlending.test',
          name: null,
          has_signed_in: false,
        },
        {
          user_id: 'cy',
          email: 'cy@bluefintestlending.test',
          name: 'Cy Adams',
          has_signed_in: false,
        },
      ],
      'ana',
    ).people,
  ).toEqual([
    ['Ana Ruiz (you)', 'ana@bluefintestlending.test'],
    ['bo@bluefintestlending.test', 'Invited, not signed in yet'],
    ['Cy Adams', 'cy@bluefintestlending.test', 'Invited, not signed in yet'],
  ]);
});
