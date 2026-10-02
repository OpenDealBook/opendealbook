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
  title: 'Open Deal Book for corporate development',
  description:
    'Run a repeatable acquisition pipeline for your corporate development team: shared stages, one diligence checklist per deal, comparables and DSCR underwriting, and offers built from the same record. Self-hostable, with a complete deal history.',
  path: '/solutions/corporate-development',
});

const stages = [
  {
    title: 'Pipeline',
    body: 'Every target in one pipeline with a shared owner, stage, and next step. Your weekly review reads the same for everyone, so deals move instead of waiting on a status update.',
  },
  {
    title: 'Diligence',
    body: 'One checklist per deal and document requests that land in the data room. Point diligence analysis at your own AI model, with sensitive fields redacted by default.',
  },
  {
    title: 'Data room',
    body: 'A secure room per deal where documents are versioned and access is granted down to a single folder. Analysts, counsel, and sellers each work in their own lane.',
  },
  {
    title: 'Underwriting',
    body: 'Run comparables against the deal and DSCR underwriting against its numbers, so the model and the diligence live in the same record rather than a spreadsheet on someone’s laptop.',
  },
  {
    title: 'Offers',
    body: 'Build and send offers from the record you ran diligence in. The stage moves, the approval is logged, and nothing is re-keyed between tools.',
  },
  {
    title: 'The record',
    body: 'Stage moves, document versions, and approvals are recorded and exportable. The full history of every deal stays yours, ready for a board, a lender, or an audit.',
  },
];

const serviceData = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Open Deal Book for corporate development',
  serviceType: 'Acquisition pipeline and diligence platform',
  description:
    'A platform for corporate development teams to run a repeatable acquisition pipeline, diligence, underwriting, and offers in one place.',
  url: `${appConfig.url}/solutions/corporate-development`,
  provider: {
    '@type': 'Organization',
    name: appConfig.name,
    url: appConfig.url,
  },
  areaServed: 'Global',
};

export default async function CorporateDevelopmentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-5xl px-6 py-16'}>
      <StructuredData data={serviceData} />

      <div className={'flex flex-col items-center gap-3 text-center'}>
        <h1 className={'text-4xl font-bold'}>
          A repeatable acquisition pipeline for corporate development
        </h1>
        <p className={'text-muted-foreground max-w-2xl'}>
          Your team runs a strategy, not one-off deals. Open Deal Book keeps
          the whole pipeline, diligence, underwriting, and offers in one
          record, so each acquisition runs the same reliable way.
        </p>
      </div>

      <div className={'mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3'}>
        {stages.map((stage) => (
          <Card key={stage.title} className={'flex flex-col'}>
            <CardHeader>
              <CardTitle className={'text-lg'}>{stage.title}</CardTitle>
            </CardHeader>
            <CardContent className={'text-muted-foreground'}>
              {stage.body}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={'mt-16 flex flex-col items-center gap-4 text-center'}>
        <h2 className={'text-2xl font-bold'}>Run your next deal here</h2>
        <p className={'text-muted-foreground max-w-xl'}>
          Start free for 30 days in a workspace of example deals, or talk to us
          about rolling it out to your team.
        </p>
        <div className={'flex flex-wrap items-center justify-center gap-3'}>
          <Button asChild>
            <Link href={'/auth/sign-up'}>Start 30-day trial</Link>
          </Button>
          <Button asChild variant={'outline'}>
            <Link href={'/contact'}>Talk to us</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
