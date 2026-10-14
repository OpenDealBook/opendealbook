import { describe, expect, it } from 'vitest';

import type { MarkedRoomFolder } from '@odb/lender-rooms/contents/listing.ts';

import {
  areUuids,
  requestKind,
  dealTeamRoots,
  roomTab,
} from './lender-page-params';

const UUID = '7d0f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';
const folder: MarkedRoomFolder = {
  id: 'f',
  name: 'F',
  hidden: { direct: false, inherited: false },
  folders: [],
  entries: [],
};

describe('lender page addresses', () => {
  it('accepts only well-formed ids', () => {
    expect(areUuids(UUID, UUID)).toBe(true);
    expect(areUuids(UUID, 'not-an-id')).toBe(false);
  });

  it('reads the request kind from the address and knows no other', () => {
    expect(requestKind('asks')).toBe('ask');
    expect(requestKind('forms')).toBe('form');
    expect(requestKind('anything-else')).toBeNull();
  });

  it('opens the tab the address names, or Requests', () => {
    expect(roomTab('people')).toBe('people');
    expect(roomTab(undefined)).toBe('requests');
    expect(roomTab('nonsense')).toBe('requests');
  });

  it('hands back both room folders of the deal team view', () => {
    expect(
      dealTeamRoots({ viewer: 'deal_team', master: folder, private: folder }),
    ).toEqual({ master: folder, private: folder });
  });

  it('gives nothing for a lender view, so the page is not found', () => {
    expect(
      dealTeamRoots({ viewer: 'lender', master: folder, private: folder }),
    ).toBeNull();
  });

  it('fails loudly when a room folder is missing', () => {
    expect(() =>
      dealTeamRoots({ viewer: 'deal_team', master: folder, private: null }),
    ).toThrow('missing a root folder');
  });
});
