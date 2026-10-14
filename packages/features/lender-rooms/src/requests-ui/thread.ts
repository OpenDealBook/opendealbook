import type { Enums, Tables } from '@odb/supabase';

type Side = Enums<'lender_side'>;
type FileRole = Enums<'lender_ask_file_role'>;

interface ThreadInput {
  request: Pick<Tables<'lender_ask'>, 'body' | 'created_by' | 'created_at'>;
  messages: Pick<
    Tables<'lender_ask_message'>,
    'id' | 'author_user_id' | 'side' | 'body' | 'created_at'
  >[];
  files: Pick<
    Tables<'lender_ask_file'>,
    'id' | 'dr_document_id' | 'role' | 'added_by' | 'created_at'
  >[];
  documents: { id: string; name: string }[];
  members: (Pick<Tables<'lender_room_member'>, 'user_id' | 'email'> & {
    name: string | null;
  })[];
}

export type ThreadFile =
  | {
      isAvailable: true;
      documentId: string;
      name: string;
      role: FileRole;
      label: string | null;
    }
  | { isAvailable: false; documentId: string; role: FileRole; notice: string };

const fileLabels = {
  blank_form: 'Form to complete',
  completed_form: 'Completed',
  signed_form: 'Signed',
  attachment: null,
  fulfilment: null,
} satisfies Record<FileRole, string | null>;

export function formToComplete(thread: ThreadEntry[]): ThreadFile | undefined {
  return thread
    .flatMap((entry) => (entry.kind === 'files' ? entry.files : []))
    .findLast((file) => file.role === 'blank_form');
}

interface Authored {
  key: string;
  side: Side;
  authorName: string | null;
  at: string;
}

export type ThreadEntry = Authored &
  ({ kind: 'message'; body: string } | { kind: 'files'; files: ThreadFile[] });

const sideOfRole = {
  blank_form: 'lender',
  fulfilment: 'internal',
  completed_form: 'internal',
  signed_form: 'internal',
} satisfies Partial<Record<FileRole, Side>>;

export function buildThread({
  request,
  messages,
  files,
  documents,
  members,
}: ThreadInput): ThreadEntry[] {
  const nameOf = new Map(
    documents.map((document) => [document.id, document.name]),
  );

  const memberOf = new Map(members.map((member) => [member.user_id, member]));

  function lenderName(side: Side, userId: string | null): string | null {
    const member =
      side === 'lender' && userId ? memberOf.get(userId) : undefined;

    return member ? (member.name ?? member.email) : null;
  }

  const lenderUserIds = new Set([
    ...members.map((member) => member.user_id),
    request.created_by,
    ...messages
      .filter((message) => message.side === 'lender')
      .map((message) => message.author_user_id),
  ]);

  function fileSide(file: ThreadInput['files'][number]): Side {
    if (file.role !== 'attachment') {
      return sideOfRole[file.role];
    }

    return lenderUserIds.has(file.added_by) ? 'lender' : 'internal';
  }

  const steps = [
    ...(request.body
      ? [
          {
            addedBy: null,
            entry: {
              kind: 'message' as const,
              key: 'opening',
              side: 'lender' as const,
              authorName: lenderName('lender', request.created_by),
              at: request.created_at,
              body: request.body,
            },
          },
        ]
      : []),
    ...messages.map((message) => ({
      addedBy: null,
      entry: {
        kind: 'message' as const,
        key: message.id,
        side: message.side,
        authorName: lenderName(message.side, message.author_user_id),
        at: message.created_at,
        body: message.body,
      },
    })),
    ...files.map((file) => {
      const name = nameOf.get(file.dr_document_id);
      const side = fileSide(file);

      return {
        addedBy: file.added_by,
        entry: {
          kind: 'files' as const,
          key: file.id,
          side,
          authorName: lenderName(side, file.added_by),
          at: file.created_at,
          files: [
            name === undefined
              ? {
                  isAvailable: false as const,
                  documentId: file.dr_document_id,
                  role: file.role,
                  notice: 'A file that is no longer available',
                }
              : {
                  isAvailable: true as const,
                  documentId: file.dr_document_id,
                  name,
                  role: file.role,
                  label: fileLabels[file.role],
                },
          ] as ThreadFile[],
        },
      };
    }),
  ].sort((a, b) => Date.parse(a.entry.at) - Date.parse(b.entry.at));

  const thread: ThreadEntry[] = [];
  let previousAddedBy: string | null = null;

  for (const { entry, addedBy } of steps) {
    const previous = thread.at(-1);

    if (
      entry.kind === 'files' &&
      previous?.kind === 'files' &&
      previousAddedBy === addedBy &&
      previous.at === entry.at
    ) {
      previous.files.push(...entry.files);
    } else {
      thread.push(entry);
    }

    previousAddedBy = addedBy;
  }

  const current = formToComplete(thread);

  for (const entry of thread) {
    if (entry.kind === 'files') {
      for (const file of entry.files) {
        if (file.role !== 'blank_form') {
          continue;
        }

        if (file.isAvailable && file !== current) {
          file.label = 'Replaced';
        }

        if (!file.isAvailable && file === current) {
          file.notice = 'The form to complete is no longer available';
        }
      }
    }
  }

  return thread;
}
