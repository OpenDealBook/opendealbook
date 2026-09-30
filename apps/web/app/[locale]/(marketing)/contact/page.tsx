import type { Metadata } from 'next';

import { Button } from '@odb/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { pageMetadata } from '~/config/seo';

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
          <form className={'flex flex-col gap-4'}>
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'name'}>Name</Label>
              <Input id={'name'} name={'name'} placeholder={'Your name'} />
            </div>

            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'email'}>Email</Label>
              <Input
                id={'email'}
                name={'email'}
                type={'email'}
                placeholder={'you@example.com'}
              />
            </div>

            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'message'}>Message</Label>
              <Input
                id={'message'}
                name={'message'}
                placeholder={'How can we help?'}
              />
            </div>

            <Button type={'submit'}>Send message</Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
