import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { StructuredData } from '~/components/structured-data';
import appConfig from '~/config/app.config';
import { pageMetadata } from '~/config/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Who Open Deal Book is for',
  description:
    'Open Deal Book is built for teams that grow by acquisition: corporate development groups, independent sponsors running roll-ups, and CPA firms acquiring practices. See the jobs it does and how a team runs deals on it.',
  path: '/customers',
});

const audiences = [
  {
    name: 'Corporate development teams',
    description:
      'In-house teams running a steady acquisition pipeline against a strategy. Open Deal Book gives analysts, counsel, and leadership one place to move each deal from sourcing through close.',
  },
  {
    name: 'Independent sponsors running roll-ups',
    description:
      'Sponsors acquiring and combining businesses in a fragmented market. Track every target in the same pipeline, reuse one diligence checklist across deals, and keep investors and lenders in their own lane.',
  },
  {
    name: 'CPA firms acquiring practices',
    description:
      'Firms growing by buying books of business and other practices. Run underwriting, diligence, and the data room in one record, and keep the deal history you can hand to a partner or a lender.',
  },
];

const jobs = [
  {
    title: 'Run a repeatable pipeline',
    body: 'Keep every target in one pipeline with a shared view of stage, owner, and next step, so no deal stalls because it lived in someone else’s inbox.',
  },
  {
    title: 'Diligence without the scramble',
    body: 'Work one checklist per deal, request documents into the data room, and point analysis at your own AI model with sensitive fields redacted by default.',
  },
  {
    title: 'Control who sees what',
    body: 'Grant access down to a single folder or contract. Outside counsel, sellers, and brokers each see only what you put them on, and every view is logged.',
  },
  {
    title: 'Underwrite and make offers',
    body: 'Run comparables and DSCR underwriting against the deal record, then build and send offers from the same place you ran diligence.',
  },
  {
    title: 'Keep the deal record',
    body: 'Stage moves, document versions, and approvals are recorded and exportable, so the full history of every deal stays yours to take with you.',
  },
];

const webPageData = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Who Open Deal Book is for',
  description:
    'The teams Open Deal Book is built for and the jobs it does across the acquisition process.',
  url: `${appConfig.url}/customers`,
  isPartOf: {
    '@type': 'WebSite',
    name: appConfig.name,
    url: appConfig.url,
  },
};

export default async function CustomersPage({
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
          Built for teams that grow by acquisition
        </h1>
        <p className={'text-muted-foreground max-w-2xl'}>
          If buying companies is part of how you grow, Open Deal Book is the
          one place your team runs each deal, from the first target to the
          signed contract.
        </p>
      </div>

      <div className={'mt-12 grid gap-6 md:grid-cols-3'}>
        {audiences.map((audience) => (
          <Card key={audience.name} className={'flex flex-col'}>
            <CardHeader>
              <CardTitle className={'text-lg'}>{audience.name}</CardTitle>
            </CardHeader>
            <CardContent className={'text-muted-foreground'}>
              {audience.description}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={'mt-16 flex flex-col gap-4'}>
        <h2 className={'text-2xl font-bold'}>The jobs it does</h2>
        <div className={'grid gap-4 md:grid-cols-2'}>
          {jobs.map((job) => (
            <div key={job.title} className={'flex flex-col gap-1'}>
              <h3 className={'font-semibold'}>{job.title}</h3>
              <p className={'text-muted-foreground'}>{job.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={'mt-16'}>
        <Card>
          <CardHeader>
            <div className={'flex items-center gap-2'}>
              <CardTitle className={'text-xl'}>
                A day in a deal team, illustrated
              </CardTitle>
              <Badge variant={'outline'}>Hypothetical</Badge>
            </div>
            <CardDescription>
              An illustrative example of how a team could run acquisitions on
              Open Deal Book. It does not describe a real customer.
            </CardDescription>
          </CardHeader>
          <CardContent className={'text-muted-foreground flex flex-col gap-3'}>
            <p>
              Picture a four-person corporate development team working six live
              targets. Each one sits in the pipeline with an owner and a stage,
              so the Monday review takes minutes instead of a round of status
              emails.
            </p>
            <p>
              On the deal moving fastest, an analyst requests the missing
              financials into the data room and runs DSCR underwriting against
              the numbers as they land. Outside counsel is invited to that deal
              only, with access to the contract folder and nothing else.
            </p>
            <p>
              When the team is ready, they build the offer from the same record
              they ran diligence in. The stage moves, the approval is logged,
              and the full history stays exportable if a lender or a partner
              asks for it later.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className={'mt-16 flex flex-col items-center gap-4 text-center'}>
        <h2 className={'text-2xl font-bold'}>See it with your own deal</h2>
        <p className={'text-muted-foreground max-w-xl'}>
          Start free for 30 days in a workspace of example deals already in
          flight, or talk to us about a rollout for your team.
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
