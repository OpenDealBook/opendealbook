import { PasswordResetRequestForm } from '@odb/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import appConfig from '~/config/app.config';
import pathsConfig from '~/config/paths.config';

const redirectTo = `${appConfig.url}${pathsConfig.auth.updatePassword}`;

export default function PasswordResetPage() {
  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            We will email you a link to reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordResetRequestForm redirectTo={redirectTo} />
        </CardContent>
      </Card>
    </main>
  );
}
