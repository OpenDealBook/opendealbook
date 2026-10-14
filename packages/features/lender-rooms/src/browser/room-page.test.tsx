import { isValidElement, type ReactElement, type ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LenderRoomSummary } from '../members/entry-rules';

const server = vi.hoisted(() => ({
  userId: 'user-ana' as string | null,
  peopleRefusal: null as string | null,
  loaded: null as unknown,
  logosSigned: [] as string[],
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: server.userId ? { id: server.userId } : null },
      }),
    },
  }),
}));
vi.mock('../contents/last-visit', () => ({
  getLastRoomVisit: async () => null,
}));
vi.mock('../contents/load-listing', () => ({
  loadRoomListing: async () => server.loaded,
}));
vi.mock('../brand/logo-url', () => ({
  brandLogoUrl: async (path: string) => {
    server.logosSigned.push(path);

    return `https://signed.test/${path}`;
  },
}));
vi.mock('./room-contact', () => ({
  loadRoomContact: async () => ({
    name: null,
    photoUrl: null,
    email: 'owner@dockside.test',
    phone: null,
  }),
}));
vi.mock('../members/actions', () => ({
  listLenderMembers: async () =>
    server.peopleRefusal
      ? { ok: false, refusal: server.peopleRefusal }
      : { ok: true, value: [] },
}));
vi.mock('../requests-ui/open-requests-summary', () => ({
  OpenRequestsSummary: () => null,
}));
vi.mock('./room-browser', () => ({ RoomBrowser: () => null }));

import { RoomBrowser } from './room-browser';
import { RoomPage } from './room-page';

const ROOM: LenderRoomSummary = {
  id: '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11',
  deal_id: '0a2c7b8e-41d7-4b4e-8f39-6b2f7a0a2b22',
  name: 'First Harbor Bank',
  welcome_note: null,
  expires_at: null,
  is_open: true,
  private_folder_id: 'own',
  master_folder_id: 'package',
  brand_name: null,
  brand_logo_path: null,
  deal_name: 'Dockside',
  deal_description: null,
};

const marks = { direct: false, inherited: false };

function folder(id: string, hidden?: typeof marks) {
  return {
    id,
    name: id,
    ...(hidden ? { hidden } : {}),
    folders: [],
    entries: [],
  };
}

function find(node: ReactNode, matches: (element: ReactElement) => boolean): ReactElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => find(child, matches));
  }

  if (!isValidElement(node)) {
    return [];
  }

  const props = node.props as { children?: ReactNode };

  return [...(matches(node) ? [node] : []), ...find(props.children, matches)];
}

describe('RoomPage', () => {
  beforeEach(() => {
    Object.assign(server, {
      userId: 'user-ana',
      peopleRefusal: null,
      loaded: { viewer: 'lender', master: folder('package'), private: folder('own') },
      logosSigned: [],
    });
  });

  it('hands the browser the signed-in person and both places', async () => {
    const page = await RoomPage({ room: ROOM });
    const [browser] = find(page, (element) => element.type === RoomBrowser);

    expect(browser!.props).toMatchObject({
      userId: 'user-ana',
      places: { shared: folder('package'), own: folder('own') },
    });
  });

  it('gives a deal-team viewer the lender view, with no hide marks', async () => {
    server.loaded = {
      viewer: 'deal_team',
      master: folder('package', marks),
      private: folder('own', marks),
    };

    const page = await RoomPage({ room: ROOM });
    const [browser] = find(page, (element) => element.type === RoomBrowser);
    const places = (browser!.props as { places: Record<string, object> }).places;

    expect(places.shared).not.toHaveProperty('hidden');
    expect(places.own).not.toHaveProperty('hidden');
  });

  it('fails loudly when nobody is signed in', async () => {
    server.userId = null;

    await expect(RoomPage({ room: ROOM })).rejects.toThrow();
  });

  it('fails loudly with the refusal when the people in the room cannot be listed', async () => {
    server.peopleRefusal = 'You do not have access to this room';

    await expect(RoomPage({ room: ROOM })).rejects.toThrow(
      'You do not have access to this room',
    );
  });

  it('fails loudly when the room has no folder of its own', async () => {
    server.loaded = { viewer: 'lender', master: folder('package'), private: null };

    await expect(RoomPage({ room: ROOM })).rejects.toThrow(
      'is missing a root folder',
    );
  });

  it('signs a logo only when the lender has one', async () => {
    const withoutLogo = await RoomPage({ room: ROOM });

    expect(server.logosSigned).toEqual([]);
    expect(find(withoutLogo, (element) => element.type === 'img')).toEqual([]);

    const withLogo = await RoomPage({
      room: { ...ROOM, brand_logo_path: 'firstharbor.test/logo.png' },
    });

    expect(server.logosSigned).toEqual(['firstharbor.test/logo.png']);
    expect(
      find(withLogo, (element) => element.type === 'img')[0]!.props,
    ).toMatchObject({ src: 'https://signed.test/firstharbor.test/logo.png' });
  });
});
