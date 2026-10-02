import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { StructuredData } from '~/components/structured-data';
import appConfig from '~/config/app.config';
import { pageMetadata } from '~/config/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Security and access control',
  description:
    'How Open Deal Book keeps deal data in the right hands: access granted down to a folder, outside counsel and sellers in their own lanes, an event-sourced audit trail, and data you own and can export.',
  path: '/security',
});

const controls = [
  {
    title: 'Access granted deliberately',
    body: 'Grant access down to a single folder or contract. People see only what you put them on, and you add and remove access per deal as the work moves.',
  },
  {
    title: 'The right people in the right lanes',
    body: 'Outside counsel, sellers, and brokers each get a scoped outside view of their documents, checklist, and meetings, and nothing else on the deal.',
  },
  {
    title: 'A secure data room per deal',
    body: 'Documents live in a room per deal where every version is kept and every view is logged, so you always know what was shared and when.',
  },
  {
    title: 'An event-sourced audit trail',
    body: 'Stage moves, document versions, and approvals are recorded as an ordered event history. The record is append-only, so you can reconstruct exactly how a deal progressed.',
  },
  {
    title: 'Bring your own AI',
    body: 'Point diligence analysis at your own model endpoint under your own agreement, with sensitive fields redacted by default, so document contents are not handed to a shared model.',
  },
  {
    title: 'You own the data',
    body: 'Your deal record is yours. Everything is exportable, and you can self-host so the data never leaves your infrastructure.',
  },
];

const webPageData = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Security and access control',
  description:
    'Access control, the data room, scoped outside access, an event-sourced audit trail, and data ownership in Open Deal Book.',
  url: `${appConfig.url}/security`,
  isPartOf: {
    '@type': 'WebSite',
    name: appConfig.name,
    url: appConfig.url,
  },
};

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-5xl px-6 py-16'}>
      <StructuredData data={webPageData} />

      <div className={'flex flex-col items-center gap-3 text-center'}>
        <h1 className={'text-4xl font-bold'}>
          Deal data stays in the right hands
        </h1>
        <p className={'text-muted-foreground max-w-2xl'}>
          Acquisitions bring outsiders close to sensitive information. Open
          Deal Book is built so each person sees only their part of a deal, and
          so you can prove exactly who saw what.
        </p>
      </div>

      <div className={'mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3'}>
        {controls.map((control) => (
          <Card key={control.title} className={'flex flex-col'}>
            <CardHeader>
              <CardTitle className={'text-lg'}>{control.title}</CardTitle>
            </CardHeader>
            <CardContent className={'text-muted-foreground'}>
              {control.body}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={'mt-16 flex flex-col items-center gap-4 text-center'}>
        <h2 className={'text-2xl font-bold'}>Review it with your team</h2>
        <p className={'text-muted-foreground max-w-xl'}>
          Talk to us about a security review, or self-host so your deal data
          never leaves your own infrastructure.
        </p>
        <div className={'flex flex-wrap items-center justify-center gap-3'}>
          <Button asChild>
            <Link href={'/contact'}>Request a security review</Link>
          </Button>
          <Button asChild variant={'outline'}>
            <Link href={'/self-hosting'}>See self-hosting</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
