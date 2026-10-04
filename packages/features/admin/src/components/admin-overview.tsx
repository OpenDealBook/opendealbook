'use client';

import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Spinner } from '@odb/ui/spinner';

import { useAdminOverview } from '../hooks/use-admin-insights';

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Badge variant={on ? 'default' : 'outline'}>{on ? 'on' : 'off'}</Badge>
    </div>
  );
}

export function AdminOverview() {
  const { data, isPending } = useAdminOverview();

  if (isPending) {
    return <Spinner />;
  }

  const { metrics, ai, optIn, config } = data!;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat label="Accounts" value={metrics.accounts} />
        <Stat label="Deals" value={metrics.deals} />
        <Stat label="Offers" value={metrics.offers} />
        <Stat label="Comparables" value={metrics.comps} />
        <Stat label="Subscriptions" value={metrics.subscriptions} />
        <Stat label="AI calls" value={metrics.aiCalls} />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Platform flags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Flag label="Team accounts" on={config.enable_team_accounts} />
            <Flag label="Account billing" on={config.enable_account_billing} />
            <Flag
              label="Team account billing"
              on={config.enable_team_account_billing}
            />
            <div className="flex items-center justify-between text-sm">
              <span>Billing provider</span>
              <Badge variant="outline">{config.billing_provider}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comps privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span>K-anonymity minimum bucket</span>
              <Badge>{config.comp_pool_min_bucket}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Accounts opted into the pool</span>
              <span>
                {optIn.active} / {optIn.total}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span>Model calls logged</span>
              <span>{ai.calls}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Configured endpoints</span>
              <span>{ai.endpoints}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
