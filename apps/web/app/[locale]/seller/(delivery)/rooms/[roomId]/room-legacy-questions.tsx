export interface LegacyQuestion {
  id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
}

export function RoomLegacyQuestions({
  questions,
}: {
  questions: LegacyQuestion[];
}) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'text-lg font-semibold'}>Earlier questions</h2>
      <ul className={'flex flex-col gap-2'}>
        {questions.map((question) => (
          <li key={question.id} className={'flex flex-col gap-1 text-sm'}>
            <span className={'font-medium'}>{question.question}</span>
            <span className={'text-muted-foreground'}>
              {question.answer ?? 'Not answered'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
