'use client';

import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';
import { Skeleton } from '@tuckin/ui/skeleton';

import { usePersonalAccountData } from '../../hooks/use-personal-account-data';
import type { PersonalAccountData } from '../../shared';
import { DeleteAccountDialog } from './delete-account-dialog';
import { MultiFactorAuthSection } from './mfa';
import { UpdateAccountImage } from './update-account-image';
import { UpdateAccountNameForm } from './update-account-name-form';
import { UpdateEmailForm } from './update-email-form';
import { UpdatePasswordForm } from './update-password-form';

export function PersonalAccountSettingsContainer({
  userId,
  account,
  children,
}: {
  userId: string;
  account?: PersonalAccountData;
  children?: ReactNode;
}) {
  const query = usePersonalAccountData(userId, account);

  if (!query.data) {
    return <Skeleton className="h-96 w-full" />;
  }

  const data = query.data;

  return (
    <div className="flex w-full flex-col space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile picture</CardTitle>
          <CardDescription>Upload a picture for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateAccountImage userId={data.id} pictureUrl={data.picture_url} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
          <CardDescription>Update your display name.</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateAccountNameForm
            userId={userId}
            displayName={data.name ?? ''}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Update your email address.</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdateEmailForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Update your password.</CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>

      <MultiFactorAuthSection />

      {children}

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Permanently delete your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog />
        </CardContent>
      </Card>
    </div>
  );
}
