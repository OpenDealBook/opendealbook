export const AnalyticsEvents = {
  // TODO(trial_started): fires when a trial is provisioned server-side. Wire it
  // either on first landing in /home (a client effect, owned by the home lane)
  // or as a server-side PostHog capture at provision time. Not wired this pass.
  trialStarted: 'trial_started',
  signupStarted: 'signup_started',
  contactSubmitted: 'contact_submitted',
  pricingViewed: 'pricing_viewed',
} as const;

export type AnalyticsEvent =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
