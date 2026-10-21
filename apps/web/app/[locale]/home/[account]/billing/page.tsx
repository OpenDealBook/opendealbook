import { TeamBillingPanel } from '@odb/team-accounts';

import appConfig from '~/config/app.config';
import { requireBilling } from '~/config/billing-gate';
import billingConfig from '~/config/billing.config';

import { GatedControl } from '../../_components/gated-control';
import { daysLeft } from '../../_components/trial-banner';
import { loadTrialState } from '../../_lib/trial';
import { loadTeamWorkspace } from '../layout';
import { PlanChoices } from './_components/plan-choices';

interface TeamBillingPageProps {
  params: Promise<{ locale: string; account: string }>;
}

export default async function TeamBillingPage({
  params,
}: TeamBillingPageProps) {
  requireBilling();
  const { account } = await params;
  const { team, subscriptionStatus, permissions } =
    await loadTeamWorkspace(account);

  const trial = await loadTrialState(team.id);
  const product = billingConfig.products[0];

  return (
    <main className={'p-8'}>
      <TeamBillingPanel
        accountId={team.id}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={
          trial.isActive && trial.endsAt ? daysLeft(trial.endsAt) : null
        }
      >
        {product ? (
          <GatedControl
            allowed={permissions.includes('billing.manage')}
            reason={'Only the team owner can change the plan.'}
          >
            <PlanChoices
              accountId={team.id}
              product={product}
              returnUrl={`${appConfig.url}/home/${account}/billing`}
            />
          </GatedControl>
        ) : null}
      </TeamBillingPanel>
    </main>
  );
}
