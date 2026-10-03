import Link from 'next/link';

import { OAuthProviders } from '@odb/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';

import { SignInMfa } from './_components/sign-in-mfa';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <SignInMfa />
          <OAuthProviders providers={authConfig.providers.oAuth} />
          <div className={'text-muted-foreground text-sm'}>
            <Link href={pathsConfig.auth.passwordReset}>Forgot password?</Link>
          </div>
          <div className={'text-muted-foreground text-sm'}>
            <Link href={pathsConfig.auth.signUp}>Create an account</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
