'use client';

import { useRouter } from 'next/navigation';

import { PasswordUpdateForm } from '@tuckin/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';

import pathsConfig from '~/config/paths.config';

export default function UpdatePasswordPage() {
  const router = useRouter();

  return (
    <main className={'flex min-h-screen items-center justify-center p-8'}>
      <Card className={'w-full max-w-sm'}>
        <CardHeader>
          <CardTitle>Update your password</CardTitle>
          <CardDescription>Choose a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordUpdateForm
            onUpdated={() => router.push(pathsConfig.app.home)}
          />
        </CardContent>
      </Card>
    </main>
  );
}
