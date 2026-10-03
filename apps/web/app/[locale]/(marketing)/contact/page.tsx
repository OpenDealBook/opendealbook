import type { Metadata } from 'next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { pageMetadata } from '~/config/seo';

import { ContactForm } from './_components/contact-form';

export const metadata: Metadata = pageMetadata({
  title: 'Contact',
  description:
    'Talk to the Open Deal Book team about running your acquisitions in one place, self-hosting, a security review, or a rollout for your deal team.',
  path: '/contact',
});

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-2xl px-6 py-16'}>
      <Card>
        <CardHeader>
          <CardTitle>Contact us</CardTitle>
          <CardDescription>
            Tell us what you need and we will get back to you.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ContactForm />
        </CardContent>
      </Card>
    </section>
  );
}
