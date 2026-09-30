import type { Metadata } from 'next';

import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

import { StructuredData } from '~/components/structured-data';
import { pageMetadata } from '~/config/seo';

export const metadata: Metadata = pageMetadata({
  title: 'FAQ',
  description:
    'Answers for M&A and corporate development teams: access control, self-hosting, outside counsel and seller access, bring-your-own-AI diligence, and data ownership.',
  path: '/faq',
});

const faqs = [
  {
    question: 'Who is Open Deal Book for?',
    answer:
      'Teams that grow by acquisition: corporate development groups, M&A teams, and the analysts, counsel, and leadership who run each deal from sourcing through integration.',
  },
  {
    question: 'How do you control who sees each deal and document?',
    answer:
      'You grant access deliberately, down to a single contract or folder. Analysts, outside counsel, sellers, and brokers each see only what you put them on, and every view is logged.',
  },
  {
    question: 'Can we self-host Open Deal Book?',
    answer:
      'Yes. Run Open Deal Book on your own infrastructure, or let us run it managed. Your deal data stays under your control either way.',
  },
  {
    question: 'Can we use our own AI model for diligence?',
    answer:
      'Yes. Point diligence analysis at your own model endpoint under your own agreement, and sensitive fields are redacted by default.',
  },
  {
    question: 'Who owns the data we put into Open Deal Book?',
    answer:
      'You do. Stage moves, document versions, and approvals are recorded and exportable, so your deal record is always yours to take with you.',
  },
  {
    question: 'How do outside counsel, sellers, and brokers get access?',
    answer:
      'You invite them to a specific deal with scoped access and the notifications they should get. They work from a clean outside view of their documents, checklist, and meetings, and nothing else.',
  },
  {
    question: 'How does the free trial work?',
    answer:
      'Start free for 30 days with a workspace of example deals already in flight, so you can explore a live-looking pipeline, data room, and contract before adding a deal of your own. No credit card to begin.',
  },
];

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-3xl px-6 py-16'}>
      <StructuredData data={faqStructuredData} />
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
