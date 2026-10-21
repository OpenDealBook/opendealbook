import type { ReactNode } from 'react';

import type { Enums } from '@odb/supabase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

export function TeamBillingPanel(props: {
  accountId: string;
  subscriptionStatus: Enums<'subscription_status'> | null;
  trialDaysLeft: number | null;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>
          {props.subscriptionStatus ??
            (props.trialDaysLeft === null
              ? 'No active subscription'
              : `Trial: ${props.trialDaysLeft} days left`)}
        </CardDescription>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}
