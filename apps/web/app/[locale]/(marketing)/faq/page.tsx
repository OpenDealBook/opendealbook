import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

const faqs = [
  {
    question: 'What is Open Deal Book?',
    answer:
      'Open Deal Book is a platform for organizing and running your team in one place.',
  },
  {
    question: 'How does billing work?',
    answer:
      'You are billed per plan on a monthly or yearly interval. See the pricing page for details.',
  },
  {
    question: 'Can I change plans later?',
    answer: 'Yes, you can upgrade or downgrade your plan at any time.',
  },
  {
    question: 'How do I get support?',
    answer: 'Reach out through the contact page and we will respond promptly.',
  },
];

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-3xl px-6 py-16'}>
      <div className={'flex flex-col items-center gap-3 text-center'}>
        <h1 className={'text-4xl font-bold'}>Frequently asked questions</h1>
        <p className={'text-muted-foreground'}>
          Answers to the questions we hear most often.
        </p>
      </div>

      <div className={'mt-12 flex flex-col gap-4'}>
        {faqs.map((faq) => (
          <Card key={faq.question}>
            <CardHeader>
              <CardTitle className={'text-lg'}>{faq.question}</CardTitle>
            </CardHeader>
            <CardContent className={'text-muted-foreground'}>
              {faq.answer}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
