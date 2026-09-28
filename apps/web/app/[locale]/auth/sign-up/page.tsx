import Link from 'next/link';

import { OAuthProviders } from '@odb/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import appConfig from '~/config/app.config';
import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';

import { SignUpRedirect } from './_components/sign-up-redirect';

const emailRedirectTo = `${appConfig.url}${pathsConfig.auth.callback}`;

export default function SignUpPage() {
  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
          <CardDescription>Create your account</CardDescription>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <SignUpRedirect emailRedirectTo={emailRedirectTo} />
          <OAuthProviders providers={authConfig.providers.oAuth} />
          <div className={'text-muted-foreground text-sm'}>
            <Link href={pathsConfig.auth.signIn}>Already have an account?</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
