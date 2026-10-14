import { describe, expect, it } from 'vitest';

import { buildThread, formToComplete } from './thread';

const LENDER = 'lender-user';
const COLLEAGUE = 'lender-colleague';
const TEAM = 'team-user';

const request = {
  body: 'Need the 2025 tax return',
  created_by: LENDER,
  created_at: '2026-10-01T09:00:00.000Z',
};

function file(
  id: string,
  at: string,
  addedBy: string,
  role:
    | 'attachment'
    | 'fulfilment'
    | 'blank_form'
    | 'completed_form'
    | 'signed_form' = 'attachment',
) {
  return {
    id,
    dr_document_id: `doc-${id}`,
    role,
    added_by: addedBy,
    created_at: at,
  };
}

function named(...ids: string[]) {
  return ids.map((id) => ({ id: `doc-${id}`, name: `${id}.pdf` }));
}

describe('buildThread', () => {
  it('opens with what the lender wrote, then messages in time order with their side', () => {
    const thread = buildThread({
      request,
      messages: [
        {
          id: 'm2',
          author_user_id: LENDER,
          side: 'lender',
          body: 'Thank you',
          created_at: '2026-10-03T09:00:00.000Z',
        },
        {
          id: 'm1',
          author_user_id: TEAM,
          side: 'internal',
          body: 'Attached',
          created_at: '2026-10-02T09:00:00.000Z',
        },
      ],
      files: [],
      documents: [],
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread.map((entry) => [entry.kind, entry.side, entry.at])).toEqual([
      ['message', 'lender', '2026-10-01T09:00:00.000Z'],
      ['message', 'internal', '2026-10-02T09:00:00.000Z'],
      ['message', 'lender', '2026-10-03T09:00:00.000Z'],
    ]);
    expect(thread[0]).toMatchObject({ body: 'Need the 2025 tax return' });
  });

  it('has no opening message when the request has no body', () => {
    expect(
      buildThread({
        request: { ...request, body: null },
        messages: [],
        files: [],
        documents: [],
        members: [
          { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
        ],
      }),
    ).toEqual([]);
  });

  it('places a file-only reply in order between the messages around it', () => {
    const thread = buildThread({
      request,
      messages: [
        {
          id: 'm1',
          author_user_id: LENDER,
          side: 'lender',
          body: 'Anything else?',
          created_at: '2026-10-04T09:00:00.000Z',
        },
      ],
      files: [
        file('a', '2026-10-02T09:00:00.000Z', TEAM, 'fulfilment'),
        file('b', '2026-10-02T09:00:00.000Z', TEAM, 'fulfilment'),
      ],
      documents: named('a', 'b'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread.map((entry) => entry.kind)).toEqual([
      'message',
      'files',
      'message',
    ]);
    expect(thread[1]).toEqual({
      kind: 'files',
      key: 'a',
      side: 'internal',
      authorName: null,
      at: '2026-10-02T09:00:00.000Z',
      files: [
        {
          isAvailable: true,
          documentId: 'doc-a',
          name: 'a.pdf',
          role: 'fulfilment',
          label: null,
        },
        {
          isAvailable: true,
          documentId: 'doc-b',
          name: 'b.pdf',
          role: 'fulfilment',
          label: null,
        },
      ],
    });
  });

  it('keeps files from different people apart', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [],
      files: [
        file('a', '2026-10-02T09:00:00.000Z', LENDER),
        file('b', '2026-10-02T10:00:00.000Z', TEAM, 'fulfilment'),
      ],
      documents: named('a', 'b'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread.map((entry) => entry.side)).toEqual(['lender', 'internal']);
  });

  it('shows a file sent with a message right after that message', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [
        {
          id: 'm1',
          author_user_id: LENDER,
          side: 'lender',
          body: 'Here is our term sheet',
          created_at: '2026-10-02T09:00:00.000Z',
        },
      ],
      files: [file('a', '2026-10-02T09:00:00.000Z', LENDER)],
      documents: named('a'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread.map((entry) => entry.kind)).toEqual(['message', 'files']);
  });

  it('puts the blank form on the lender side and returned files on the team side whoever added them', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [],
      files: [
        file(
          'blank',
          '2026-10-02T09:00:00.000Z',
          'someone-removed',
          'blank_form',
        ),
        file('done', '2026-10-03T09:00:00.000Z', TEAM, 'completed_form'),
        file('signed', '2026-10-04T09:00:00.000Z', 'service', 'signed_form'),
      ],
      documents: named('blank', 'done', 'signed'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread.map((entry) => entry.side)).toEqual([
      'lender',
      'internal',
      'internal',
    ]);
  });

  it('treats an attachment as the lender side when a room member, the opener, or a lender-side author added it', () => {
    const thread = buildThread({
      request: { ...request, body: null, created_by: 'opener' },
      messages: [
        {
          id: 'm1',
          author_user_id: COLLEAGUE,
          side: 'lender',
          body: 'From my colleague',
          created_at: '2026-10-01T10:00:00.000Z',
        },
      ],
      files: [
        file('a', '2026-10-02T09:00:00.000Z', LENDER),
        file('b', '2026-10-03T09:00:00.000Z', 'opener'),
        file('c', '2026-10-04T09:00:00.000Z', COLLEAGUE),
        file('d', '2026-10-05T09:00:00.000Z', TEAM),
      ],
      documents: named('a', 'b', 'c', 'd'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(
      thread
        .filter((entry) => entry.kind === 'files')
        .map((entry) => entry.side),
    ).toEqual(['lender', 'lender', 'lender', 'internal']);
  });

  it('keeps a file the viewer can no longer open as an unavailable entry in its place', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [],
      files: [
        file('gone', '2026-10-02T09:00:00.000Z', TEAM, 'fulfilment'),
        file('kept', '2026-10-02T09:00:00.000Z', TEAM, 'fulfilment'),
      ],
      documents: named('kept'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({
      files: [
        {
          isAvailable: false,
          notice: 'A file that is no longer available',
        },
        { isAvailable: true, name: 'kept.pdf' },
      ],
    });
  });

  it('says so when the form to complete is the file that is unavailable', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [],
      files: [file('blank', '2026-10-02T09:00:00.000Z', LENDER, 'blank_form')],
      documents: [],
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread[0]).toMatchObject({
      files: [
        {
          isAvailable: false,
          notice: 'The form to complete is no longer available',
        },
      ],
    });
    expect(formToComplete(thread)).toMatchObject({ isAvailable: false });
  });

  it('orders by the moment itself when times are written with different offsets', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [
        {
          id: 'later',
          author_user_id: TEAM,
          side: 'internal',
          body: 'Written second',
          created_at: '2026-10-02T09:30:00+00:00',
        },
        {
          id: 'earlier',
          author_user_id: LENDER,
          side: 'lender',
          body: 'Written first',
          created_at: '2026-10-02T11:00:00+02:00',
        },
      ],
      files: [],
      documents: [],
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread.map((entry) => entry.key)).toEqual(['earlier', 'later']);
  });

  it('keeps entries written at the same moment in the order they were written', () => {
    const at = '2026-10-02T09:00:00.000Z';
    const thread = buildThread({
      request: { ...request, body: null },
      messages: ['m1', 'm2', 'm3'].map((id) => ({
        id,
        author_user_id: LENDER,
        side: 'lender' as const,
        body: id,
        created_at: at,
      })),
      files: [],
      documents: [],
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(thread.map((entry) => entry.key)).toEqual(['m1', 'm2', 'm3']);
  });

  it('keeps a later file-only reply from the same person as its own group with its own time', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [],
      files: [
        file('a', '2026-10-02T09:00:00.000Z', LENDER),
        file('b', '2026-10-02T09:00:00.000Z', LENDER),
        file('c', '2026-10-02T09:05:00.000Z', LENDER),
      ],
      documents: named('a', 'b', 'c'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(
      thread.map((entry) => [
        entry.at,
        entry.kind === 'files' &&
          entry.files.map((each) => each.isAvailable && each.name),
      ]),
    ).toEqual([
      ['2026-10-02T09:00:00.000Z', ['a.pdf', 'b.pdf']],
      ['2026-10-02T09:05:00.000Z', ['c.pdf']],
    ]);
  });

  const conversation = {
    request: { ...request, created_by: LENDER },
    messages: [
      {
        id: 'm1',
        author_user_id: COLLEAGUE,
        side: 'lender' as const,
        body: 'From someone since removed from the room',
        created_at: '2026-10-02T09:00:00.000Z',
      },
      {
        id: 'm2',
        author_user_id: TEAM,
        side: 'internal' as const,
        body: 'Answer',
        created_at: '2026-10-03T09:00:00.000Z',
      },
    ],
    files: [file('a', '2026-10-04T09:00:00.000Z', LENDER)],
    documents: named('a'),
  };

  it('names a lender person by the name they gave', () => {
    const thread = buildThread({
      ...conversation,
      members: [
        {
          user_id: LENDER,
          email: 'dana.ruiz@firstharbor.test',
          name: 'Dana Ruiz',
        },
      ],
    });

    expect(thread.map((entry) => [entry.side, entry.authorName])).toEqual([
      ['lender', 'Dana Ruiz'],
      ['lender', null],
      ['internal', null],
      ['lender', 'Dana Ruiz'],
    ]);
  });

  it('shows the whole email of a lender person who has not given a name', () => {
    const thread = buildThread({
      ...conversation,
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
        { user_id: TEAM, email: 'never-a-lender@odb.test', name: 'Pat Team' },
      ],
    });

    expect(thread.map((entry) => [entry.side, entry.authorName])).toEqual([
      ['lender', 'dana.ruiz@firstharbor.test'],
      ['lender', null],
      ['internal', null],
      ['lender', 'dana.ruiz@firstharbor.test'],
    ]);
  });

  it('labels the newest form file as the form to complete and earlier ones as replaced', () => {
    const thread = buildThread({
      request: { ...request, body: null },
      messages: [],
      files: [
        file('first', '2026-10-02T09:00:00.000Z', LENDER, 'blank_form'),
        file('second', '2026-10-03T09:00:00.000Z', LENDER, 'blank_form'),
        file('cover', '2026-10-03T09:00:00.000Z', LENDER),
        file('done', '2026-10-04T09:00:00.000Z', TEAM, 'completed_form'),
        file('signed', '2026-10-05T09:00:00.000Z', TEAM, 'signed_form'),
      ],
      documents: named('first', 'second', 'cover', 'done', 'signed'),
      members: [
        { user_id: LENDER, email: 'dana.ruiz@firstharbor.test', name: null },
      ],
    });

    expect(
      thread.flatMap((entry) =>
        entry.kind === 'files'
          ? entry.files.map(
              (each) => each.isAvailable && [each.name, each.label],
            )
          : [],
      ),
    ).toEqual([
      ['first.pdf', 'Replaced'],
      ['second.pdf', 'Form to complete'],
      ['cover.pdf', null],
      ['done.pdf', 'Completed'],
      ['signed.pdf', 'Signed'],
    ]);
    expect(formToComplete(thread)).toMatchObject({ name: 'second.pdf' });
  });
});
