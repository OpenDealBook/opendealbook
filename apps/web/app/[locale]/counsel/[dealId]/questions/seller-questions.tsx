import type { Enums } from '@odb/supabase';

import { counselFilePath } from '../data-room/file-path';

export interface CounselSellerQuestion {
  id: string;
  title: string;
  body: string | null;
  status: Enums<'seller_room_question_status'>;
  messages: { side: Enums<'seller_side'>; body: string }[];
  files: { documentId: string; name: string }[];
}

const STATUS_LABEL: Record<CounselSellerQuestion['status'], string> = {
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
};

const SIDE_LABEL: Record<Enums<'seller_side'>, string> = {
  seller: 'Seller',
  internal: 'Deal team',
};

export function SellerQuestions({
  dealId,
  questions,
}: {
  dealId: string;
  questions: CounselSellerQuestion[];
}) {
  if (questions.length === 0) {
    return (
      <p className={'text-muted-foreground'}>
        Questions the deal team asks the seller show here.
      </p>
    );
  }

  return (
    <section className={'flex flex-col gap-3'}>
      {questions.map((question) => (
        <article
          key={question.id}
          className={'flex flex-col gap-2 rounded-md border p-3'}
        >
          <h3 className={'font-medium'}>{question.title}</h3>
          <p className={'text-muted-foreground text-sm'}>
            {STATUS_LABEL[question.status]}
          </p>
          {question.body ? <p className={'text-sm'}>{question.body}</p> : null}
          <ul className={'flex flex-col gap-1 text-sm'}>
            {question.messages.map((message, index) => (
              <li key={index}>
                <span className={'font-medium'}>
                  {SIDE_LABEL[message.side]}:
                </span>{' '}
                {message.body}
              </li>
            ))}
            {question.files.map((file) => (
              <li key={file.documentId}>
                <a
                  className={'underline'}
                  href={counselFilePath(dealId, file.documentId)}
                >
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
