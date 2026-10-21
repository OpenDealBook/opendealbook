import { describe, expect, it } from 'vitest';

import { groupVisibleItems } from './digest-content';

const balanceSheet = '11111111-1111-4111-8111-111111111111';
const taxReturn = '22222222-2222-4222-8222-222222222222';
const lease = '33333333-3333-4333-8333-333333333333';
const roomOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const folderOne = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
const folderTwo = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';
const roomTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ebitdaEntry = '44444444-4444-4444-8444-444444444444';

describe('groupVisibleItems', () => {
  it('groups the still-visible documents by room, marking each new or updated', () => {
    const rooms = groupVisibleItems(
      [
        { documentId: balanceSheet, isNewVersion: false },
        { documentId: lease, isNewVersion: false },
        { documentId: taxReturn, isNewVersion: true },
      ],
      [
        {
          document_id: taxReturn,
          name: 'Tax return 2025.pdf',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
        {
          document_id: lease,
          name: 'Lease.pdf',
          folder_id: folderOne,
          room_id: roomTwo,
          room_name: 'Second Harbor Bank',
          outside_name: 'Project Birch',
        },
        {
          document_id: balanceSheet,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
      [],
    );

    expect(rooms).toEqual([
      {
        roomId: roomOne,
        name: 'Project Atlas',
        items: [
          { kind: 'document', name: 'Balance sheet.xlsx', status: 'new' },
          { kind: 'document', name: 'Tax return 2025.pdf', status: 'updated' },
        ],
        moreCount: 0,
      },
      {
        roomId: roomTwo,
        name: 'Project Birch',
        items: [{ kind: 'document', name: 'Lease.pdf', status: 'new' }],
        moreCount: 0,
      },
    ]);
  });

  it('leaves out every document the lookup did not return', () => {
    const rooms = groupVisibleItems(
      [
        { documentId: balanceSheet, isNewVersion: false },
        { documentId: taxReturn, isNewVersion: true },
      ],
      [
        {
          document_id: taxReturn,
          name: 'Tax return 2025.pdf',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
      [],
    );

    expect(rooms).toEqual([
      {
        roomId: roomOne,
        name: 'Project Atlas',
        items: [
          { kind: 'document', name: 'Tax return 2025.pdf', status: 'updated' },
        ],
        moreCount: 0,
      },
    ]);
  });

  it('returns no rooms when nothing is visible any more', () => {
    expect(
      groupVisibleItems(
        [{ documentId: balanceSheet, isNewVersion: false }],
        [],
        [],
      ),
    ).toEqual([]);
  });

  it('lists a document added and then replaced in the same window once, as new', () => {
    const rooms = groupVisibleItems(
      [
        { documentId: balanceSheet, isNewVersion: false },
        { documentId: taxReturn, isNewVersion: true },
      ],
      [
        {
          document_id: balanceSheet,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
        {
          document_id: taxReturn,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
      [],
    );

    expect(rooms[0]?.items).toEqual([
      { kind: 'document', name: 'Balance sheet.xlsx', status: 'new' },
    ]);
  });

  it('lists a document replaced twice in the same window once, as updated', () => {
    const rooms = groupVisibleItems(
      [
        { documentId: balanceSheet, isNewVersion: true },
        { documentId: taxReturn, isNewVersion: true },
      ],
      [
        {
          document_id: balanceSheet,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
        {
          document_id: taxReturn,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
      [],
    );

    expect(rooms[0]?.items).toEqual([
      { kind: 'document', name: 'Balance sheet.xlsx', status: 'updated' },
    ]);
  });

  it('lists two files with the same name in different folders of a room as two documents', () => {
    const rooms = groupVisibleItems(
      [
        { documentId: balanceSheet, isNewVersion: false },
        { documentId: taxReturn, isNewVersion: true },
      ],
      [
        {
          document_id: balanceSheet,
          name: 'Summary.pdf',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
        {
          document_id: taxReturn,
          name: 'Summary.pdf',
          folder_id: folderTwo,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
      [],
    );

    expect(rooms[0]?.items).toEqual([
      { kind: 'document', name: 'Summary.pdf', status: 'new' },
      { kind: 'document', name: 'Summary.pdf', status: 'updated' },
    ]);
  });

  it('keeps the first 25 documents of a room and counts the rest', () => {
    const ids = Array.from(
      { length: 28 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    const rooms = groupVisibleItems(
      ids.map((documentId) => ({ documentId, isNewVersion: false })),
      ids.map((document_id, index) => ({
        document_id,
        name: `File ${index + 1}.pdf`,
        folder_id: folderOne,
        room_id: roomOne,
        room_name: 'First Harbor Bank',
        outside_name: 'Project Atlas',
      })),
      [],
    );

    expect(rooms[0]?.items).toHaveLength(25);
    expect(rooms[0]?.items.at(-1)).toEqual({
      kind: 'document',
      name: 'File 25.pdf',
      status: 'new',
    });
    expect(rooms[0]?.moreCount).toBe(3);
  });

  it('lists a published FAQ entry under the room the lookup names', () => {
    const rooms = groupVisibleItems(
      [{ kind: 'faq', entryId: ebitdaEntry }],
      [],
      [
        {
          entry_id: ebitdaEntry,
          question: 'What was 2025 EBITDA?',
          room_id: roomTwo,
          room_name: 'Second Harbor Bank',
          outside_name: 'Project Birch',
        },
      ],
    );

    expect(rooms).toEqual([
      {
        roomId: roomTwo,
        name: 'Project Birch',
        items: [{ kind: 'faq', question: 'What was 2025 EBITDA?' }],
        moreCount: 0,
      },
    ]);
  });

  it('lists an FAQ entry delivered more than once in the same window once', () => {
    const rooms = groupVisibleItems(
      [
        { kind: 'faq', entryId: ebitdaEntry },
        { kind: 'faq', entryId: ebitdaEntry },
      ],
      [],
      [
        {
          entry_id: ebitdaEntry,
          question: 'What was 2025 EBITDA?',
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
    );

    expect(rooms[0]?.items).toEqual([
      { kind: 'faq', question: 'What was 2025 EBITDA?' },
    ]);
  });

  it('leaves out every FAQ entry the lookup did not return', () => {
    expect(
      groupVisibleItems([{ kind: 'faq', entryId: ebitdaEntry }], [], []),
    ).toEqual([]);
  });

  it('lists documents and FAQ entries of a room together in the order they arrived', () => {
    const rooms = groupVisibleItems(
      [
        { documentId: balanceSheet, isNewVersion: false },
        { kind: 'faq', entryId: ebitdaEntry },
        { documentId: taxReturn, isNewVersion: true },
      ],
      [
        {
          document_id: balanceSheet,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
        {
          document_id: taxReturn,
          name: 'Tax return 2025.pdf',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
      [
        {
          entry_id: ebitdaEntry,
          question: 'What was 2025 EBITDA?',
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
    );

    expect(rooms).toEqual([
      {
        roomId: roomOne,
        name: 'Project Atlas',
        items: [
          { kind: 'document', name: 'Balance sheet.xlsx', status: 'new' },
          { kind: 'faq', question: 'What was 2025 EBITDA?' },
          { kind: 'document', name: 'Tax return 2025.pdf', status: 'updated' },
        ],
        moreCount: 0,
      },
    ]);
  });

  it('counts FAQ entries toward the 25 lines a room shows', () => {
    const ids = Array.from(
      { length: 25 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    const rooms = groupVisibleItems(
      [
        ...ids.map((documentId) => ({ documentId, isNewVersion: false })),
        { kind: 'faq' as const, entryId: ebitdaEntry },
      ],
      ids.map((document_id, index) => ({
        document_id,
        name: `File ${index + 1}.pdf`,
        folder_id: folderOne,
        room_id: roomOne,
        room_name: 'First Harbor Bank',
        outside_name: 'Project Atlas',
      })),
      [
        {
          entry_id: ebitdaEntry,
          question: 'What was 2025 EBITDA?',
          room_id: roomOne,
          room_name: 'First Harbor Bank',
          outside_name: 'Project Atlas',
        },
      ],
    );

    expect(rooms[0]?.items).toHaveLength(25);
    expect(rooms[0]?.items).not.toContainEqual({
      kind: 'faq',
      question: 'What was 2025 EBITDA?',
    });
    expect(rooms[0]?.moreCount).toBe(1);
  });
});
