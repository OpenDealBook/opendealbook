import { describe, expect, it } from 'vitest';

import { groupVisibleDocuments } from './digest-content';

const balanceSheet = '11111111-1111-4111-8111-111111111111';
const taxReturn = '22222222-2222-4222-8222-222222222222';
const lease = '33333333-3333-4333-8333-333333333333';
const roomOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const folderOne = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';
const folderTwo = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';
const roomTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('groupVisibleDocuments', () => {
  it('groups the still-visible documents by room, marking each new or updated', () => {
    const rooms = groupVisibleDocuments(
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
        },
        {
          document_id: lease,
          name: 'Lease.pdf',
          folder_id: folderOne,
          room_id: roomTwo,
          room_name: 'Second Harbor Bank',
        },
        {
          document_id: balanceSheet,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
        },
      ],
    );

    expect(rooms).toEqual([
      {
        roomId: roomOne,
        name: 'First Harbor Bank',
        documents: [
          { name: 'Balance sheet.xlsx', status: 'new' },
          { name: 'Tax return 2025.pdf', status: 'updated' },
        ],
        moreCount: 0,
      },
      {
        roomId: roomTwo,
        name: 'Second Harbor Bank',
        documents: [{ name: 'Lease.pdf', status: 'new' }],
        moreCount: 0,
      },
    ]);
  });

  it('leaves out every document the lookup did not return', () => {
    const rooms = groupVisibleDocuments(
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
        },
      ],
    );

    expect(rooms).toEqual([
      {
        roomId: roomOne,
        name: 'First Harbor Bank',
        documents: [{ name: 'Tax return 2025.pdf', status: 'updated' }],
        moreCount: 0,
      },
    ]);
  });

  it('returns no rooms when nothing is visible any more', () => {
    expect(
      groupVisibleDocuments(
        [{ documentId: balanceSheet, isNewVersion: false }],
        [],
      ),
    ).toEqual([]);
  });

  it('lists a document added and then replaced in the same window once, as new', () => {
    const rooms = groupVisibleDocuments(
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
        },
        {
          document_id: taxReturn,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
        },
      ],
    );

    expect(rooms[0]?.documents).toEqual([
      { name: 'Balance sheet.xlsx', status: 'new' },
    ]);
  });

  it('lists a document replaced twice in the same window once, as updated', () => {
    const rooms = groupVisibleDocuments(
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
        },
        {
          document_id: taxReturn,
          name: 'Balance sheet.xlsx',
          folder_id: folderOne,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
        },
      ],
    );

    expect(rooms[0]?.documents).toEqual([
      { name: 'Balance sheet.xlsx', status: 'updated' },
    ]);
  });

  it('lists two files with the same name in different folders of a room as two documents', () => {
    const rooms = groupVisibleDocuments(
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
        },
        {
          document_id: taxReturn,
          name: 'Summary.pdf',
          folder_id: folderTwo,
          room_id: roomOne,
          room_name: 'First Harbor Bank',
        },
      ],
    );

    expect(rooms[0]?.documents).toEqual([
      { name: 'Summary.pdf', status: 'new' },
      { name: 'Summary.pdf', status: 'updated' },
    ]);
  });

  it('keeps the first 25 documents of a room and counts the rest', () => {
    const ids = Array.from(
      { length: 28 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    const rooms = groupVisibleDocuments(
      ids.map((documentId) => ({ documentId, isNewVersion: false })),
      ids.map((document_id, index) => ({
        document_id,
        name: `File ${index + 1}.pdf`,
        folder_id: folderOne,
        room_id: roomOne,
        room_name: 'First Harbor Bank',
      })),
    );

    expect(rooms[0]?.documents).toHaveLength(25);
    expect(rooms[0]?.documents.at(-1)).toEqual({
      name: 'File 25.pdf',
      status: 'new',
    });
    expect(rooms[0]?.moreCount).toBe(3);
  });
});
