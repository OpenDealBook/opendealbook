interface Deadline {
  label: string;
  targetOn: string;
}

function day(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
  });
}

function deadlineStep(deadline: Deadline, prefix: string) {
  return {
    key: `${deadline.label}-${deadline.targetOn}`,
    text: `${prefix}${deadline.label} by ${day(deadline.targetOn)}`,
  };
}

export function NextStep({
  questions,
  deadlines,
  items,
  today,
}: {
  questions: { id: string; title: string }[];
  deadlines: Deadline[];
  items: { title: string; due_at: string | null }[];
  today: string;
}) {
  const datedItems = items.flatMap((item) =>
    item.due_at ? [{ label: item.title, targetOn: item.due_at.slice(0, 10) }] : [],
  );
  const dated = [...deadlines, ...datedItems];
  const steps = [
    ...dated
      .filter((deadline) => deadline.targetOn < today)
      .map((deadline) => deadlineStep(deadline, 'Overdue: ')),
    ...questions.map((question) => ({
      key: question.id,
      text: `Answer: ${question.title}`,
    })),
    ...datedItems
      .filter((item) => item.targetOn >= today)
      .map((item) => deadlineStep(item, '')),
    ...items
      .filter((item) => item.due_at === null)
      .map((item) => ({ key: `item-${item.title}`, text: item.title })),
    ...deadlines
      .filter((deadline) => deadline.targetOn >= today)
      .map((deadline) => deadlineStep(deadline, '')),
  ];

  return (
    <section
      aria-labelledby={'next-step'}
      className={'bg-muted/40 flex flex-col gap-2 rounded-lg border p-4'}
    >
      <h2 id={'next-step'} className={'text-lg font-semibold'}>
        Next step
      </h2>
      {steps.length === 0 ? (
        <p className={'text-muted-foreground'}>Nothing needed from you today</p>
      ) : (
        <ul className={'flex flex-col gap-1'}>
          {steps.map((step) => (
            <li key={step.key}>{step.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
