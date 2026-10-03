export interface TrialDripEligibility {
  trialActive: boolean;
  unsubscribed: boolean;
}

export type TrialDripDecision = 'send' | 'stop';

export function trialDripDecision(
  eligibility: TrialDripEligibility,
): TrialDripDecision {
  return eligibility.trialActive && !eligibility.unsubscribed ? 'send' : 'stop';
}
