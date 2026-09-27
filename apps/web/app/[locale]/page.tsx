import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@tuckin/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';

import pathsConfig from '~/config/paths.config';

export const metadata: Metadata = {
  title: 'OpenDealbook, the deal platform for M&A teams',
  description:
    'Run every acquisition in one place. Start a free 30-day trial preloaded with example deals: pipeline, diligence, data room, contracts, and closing, with your team and the other side in the right lanes.',
};

const signUpHref = pathsConfig.auth.signUp;

const benefits = [
  {
    title: 'One source of truth for the whole deal.',
    body: 'Sourcing, qualification, LOI, diligence, data room, meetings, closing, and integration all live on the deal timeline. Nothing gets lost in someone’s inbox.',
  },
  {
    title: 'Everyone in the right lane.',
    body: 'Add your analysts, counsel, the seller, and their broker to a deal and grant each exactly what they should see, down to a single contract or folder. Outside counsel sees the LOI you put them on and nothing else.',
  },
  {
    title: 'A process your team runs the same way every time.',
    body: 'Stages, checklists, templates, and weekly cadences turn each acquisition into a repeatable playbook instead of a fire drill, so a second and third deal do not cost you a second and third process.',
  },
  {
    title: 'Visibility from pipeline to close.',
    body: 'See every deal by stage, days in stage, open diligence items, and contract turns. Leadership gets the picture without a status meeting.',
  },
];

const steps = [
  {
    title: 'Define what you buy.',
    body: 'Set your acquisition criteria once. Every firm gets scored against it and your pipeline sorts itself.',
  },
  {
    title: 'Move the deal through stages.',
    body: 'Qualify, sign the LOI, open the data room, run diligence and weekly meetings, and negotiate the APA, each turn versioned and logged.',
  },
  {
    title: 'Bring in the right people.',
    body: 'Invite counsel, the seller, and brokers with scoped access and the notifications they should get, nothing more.',
  },
  {
    title: 'Close and integrate.',
    body: 'Generate and e-sign documents, work the closing checklist, then run the 30/60/90 integration plan, all on the same deal.',
  },
];

const roles = [
  'Deal leads move stages, send documents, and approve LOIs and the APA.',
  'Analysts run diligence and checklists without touching approvals.',
  'Counsel work the contract in a versioned workspace with tracked changes, on the deals you add them to.',
  'Sellers and brokers get a clean outside view: their documents, their checklist, their meetings, and nothing else.',
];

const trust = [
  {
    title: 'You control access.',
    body: 'Every grant is deliberate and every view is logged. Counsel who are not on a contract cannot open it.',
  },
  {
    title: 'Self-host or run it managed.',
    body: 'OpenDealbook runs on your own infrastructure if you want it there.',
  },
  {
    title: 'Bring your own AI.',
    body: 'Point diligence analysis at your own model endpoint under your own agreement. Sensitive fields are redacted by default.',
  },
  {
    title: 'Everything is auditable.',
    body: 'Stage moves, document views, contract versions, and approvals are recorded and exportable.',
  },
];

export default function LandingPage() {
  return (
    <div className={'flex flex-col'}>
      <section
        className={
          'mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center'
        }
      >
        <h1 className={'max-w-3xl text-4xl font-bold sm:text-5xl'}>
          Run every acquisition in one place.
        </h1>
        <p className={'text-muted-foreground max-w-2xl text-lg'}>
          OpenDealbook is the deal platform for teams that grow by acquisition.
          Pipeline, diligence, data room, contracts, and closing, with your team
          and outside counsel, sellers, and brokers each in exactly the right
          lane. Start free with a workspace of example deals already in flight.
        </p>
        <div className={'flex flex-wrap items-center justify-center gap-3'}>
          <Button asChild size={'lg'}>
            <Link href={signUpHref}>Start your free trial</Link>
          </Button>
          <Button asChild variant={'outline'} size={'lg'}>
            <Link href={'#how-it-works'}>See how a deal runs</Link>
          </Button>
        </div>
      </section>

      {/* Social proof strip omitted: real customer logos, stats, and testimonials go here once available. */}

      <section
        className={
          'mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16 text-center'
        }
      >
        <h2 className={'text-3xl font-bold'}>
          Your deals live in twelve tools. None of them talk.
        </h2>
        <p className={'text-muted-foreground text-lg'}>
          Acquisitions run across inboxes, spreadsheets, shared drives, a
          separate data room, and a signing tool, with counsel and sellers
          looped in by email. Every deal starts the process over. Leadership
          cannot see where things stand. And the one thing that has to be
          airtight, who can see what, is the hardest thing to control. When
          acquisition is your growth strategy, that does not scale.
        </p>
      </section>

      <section className={'mx-auto w-full max-w-6xl px-6 py-16'}>
        <div className={'grid gap-6 sm:grid-cols-2'}>
          {benefits.map((benefit) => (
            <Card key={benefit.title}>
              <CardHeader>
                <CardTitle>{benefit.title}</CardTitle>
                <CardDescription>{benefit.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section
        id={'how-it-works'}
        className={'mx-auto w-full max-w-6xl px-6 py-16'}
      >
        <h2 className={'mb-10 text-center text-3xl font-bold'}>
          From first conversation to close, on one clock.
        </h2>
        <ol className={'grid gap-6 sm:grid-cols-2'}>
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card className={'h-full'}>
                <CardHeader>
                  <CardTitle>
                    <span className={'text-muted-foreground mr-2'}>
                      {index + 1}.
                    </span>
                    {step.title}
                  </CardTitle>
                  <CardDescription>{step.body}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={
          'mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16 text-center'
        }
      >
        <h2 className={'text-3xl font-bold'}>
          Explore a real pipeline on day one.
        </h2>
        <p className={'text-muted-foreground text-lg'}>
          Your trial account comes loaded with example deals across every stage,
          so you can open a live-looking data room, work a diligence checklist,
          and page through a contract before you add a single deal of your own.
        </p>
      </section>

      <section className={'mx-auto w-full max-w-6xl px-6 py-16'}>
        <div className={'mb-10 flex flex-col gap-3 text-center'}>
          <h2 className={'text-3xl font-bold'}>
            Built for the people who run the deal.
          </h2>
          <p className={'text-muted-foreground text-lg'}>
            Your deal team, your counsel, and the other side, working in the
            same system.
          </p>
        </div>
        <div className={'grid gap-6 sm:grid-cols-2'}>
          {roles.map((role) => (
            <Card key={role}>
              <CardContent className={'pt-6'}>
                <p>{role}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className={'mx-auto w-full max-w-6xl px-6 py-16'}>
        <h2 className={'mb-10 text-center text-3xl font-bold'}>
          Your deal data stays yours.
        </h2>
        <div className={'grid gap-6 sm:grid-cols-2'}>
          {trust.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section
        className={
          'mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center'
        }
      >
        <h2 className={'text-3xl font-bold'}>
          Give your next acquisition a home.
        </h2>
        <p className={'text-muted-foreground text-lg'}>
          Start free with a full pipeline of example deals to explore, then
          bring your own when you are ready.
        </p>
        <Button asChild size={'lg'}>
          <Link href={signUpHref}>Start your 30-day free trial</Link>
        </Button>
        <p className={'text-muted-foreground text-sm'}>
          Free for 30 days. No credit card to start.
        </p>
      </section>
    </div>
  );
}
