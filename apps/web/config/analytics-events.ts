export const AnalyticsEvents = {
  trialStarted: 'trial_started',
  signupStarted: 'signup_started',
  contactSubmitted: 'contact_submitted',
  pricingViewed: 'pricing_viewed',
} as const;

export type AnalyticsEvent =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];
