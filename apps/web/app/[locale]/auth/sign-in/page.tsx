import Link from 'next/link';

import { SignInForm, OAuthProviders } from '@tuckin/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';

import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';

export default function SignInPage() {
  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <SignInForm />
          <OAuthProviders providers={authConfig.providers.oAuth} />
          <div className={'text-sm text-muted-foreground'}>
            <Link href={pathsConfig.auth.passwordReset}>Forgot password?</Link>
          </div>
          <div className={'text-sm text-muted-foreground'}>
            <Link href={pathsConfig.auth.signUp}>Create an account</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
