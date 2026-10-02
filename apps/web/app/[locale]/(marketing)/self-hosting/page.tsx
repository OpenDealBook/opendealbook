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
  title: 'Self-hosting Open Deal Book',
  description:
    'Run Open Deal Book on your own infrastructure: everything in your cluster, your own AI model for diligence, and deal data that never leaves your control. Or let us run it managed.',
  path: '/self-hosting',
});

const points = [
  {
    title: 'Everything in your cluster',
    body: 'Run the full platform in your own infrastructure. Pipeline, diligence, the data room, underwriting, and offers all run where you run them, not on a tenant you share with anyone else.',
  },
  {
    title: 'Bring your own AI',
    body: 'Point diligence analysis at your own model endpoint under your own agreement, with sensitive fields redacted by default, so document contents stay inside your boundary.',
  },
  {
    title: 'Your data stays yours',
    body: 'Deal records, documents, and the full event history live in your database. Nothing is sent out for you to later ask for back.',
  },
  {
    title: 'Managed if you prefer',
    body: 'Not ready to self-host? Run the same platform managed by us, and move to your own infrastructure later. Your deal data stays under your control either way.',
  },
];

const webPageData = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Self-hosting Open Deal Book',
  description:
    'Run Open Deal Book in your own cluster with your own AI model and full ownership of your deal data, or run it managed.',
  url: `${appConfig.url}/self-hosting`,
  isPartOf: {
    '@type': 'WebSite',
    name: appConfig.name,
    url: appConfig.url,
  },
};

export default async function SelfHostingPage({
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
          Run Open Deal Book on your own infrastructure
        </h1>
        <p className={'text-muted-foreground max-w-2xl'}>
          Deal data is some of the most sensitive you hold. Self-host Open Deal
          Book so every part of it runs in your cluster, against your own AI,
          with nothing leaving your control.
        </p>
      </div>

      <div className={'mt-12 grid gap-6 md:grid-cols-2'}>
        {points.map((point) => (
          <Card key={point.title} className={'flex flex-col'}>
            <CardHeader>
              <CardTitle className={'text-lg'}>{point.title}</CardTitle>
            </CardHeader>
            <CardContent className={'text-muted-foreground'}>
              {point.body}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={'mt-16 flex flex-col items-center gap-4 text-center'}>
        <h2 className={'text-2xl font-bold'}>Talk through your setup</h2>
        <p className={'text-muted-foreground max-w-xl'}>
          Tell us about your infrastructure and your model, and we will walk
          you through running Open Deal Book in your own environment.
        </p>
        <div className={'flex flex-wrap items-center justify-center gap-3'}>
          <Button asChild>
            <Link href={'/contact'}>Talk to us about self-hosting</Link>
          </Button>
          <Button asChild variant={'outline'}>
            <Link href={'/security'}>See security</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
