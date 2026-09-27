'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';

import { MultiFactorAuthList } from './multi-factor-auth-list';
import { RecoveryCodesManagement } from './recovery-codes-management';

export function MultiFactorAuthSection() {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Add an authenticator app for a second sign-in step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MultiFactorAuthList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recovery codes</CardTitle>
          <CardDescription>
            One-time codes to sign in when you lose your authenticator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecoveryCodesManagement />
        </CardContent>
      </Card>
    </>
  );
}
