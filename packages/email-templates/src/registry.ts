import { renderInvitationEmail } from './emails/invitation.email';
import { renderPasswordResetEmail } from './emails/password-reset.email';
import { renderTrialDayOneEmail } from './emails/trial-day-1.email';
import { renderTrialDayThreeEmail } from './emails/trial-day-3.email';
import { renderTrialDaySixEmail } from './emails/trial-day-6.email';
import { renderVerificationEmail } from './emails/verification.email';
import { renderWelcomeEmail } from './emails/welcome.email';

export const EMAIL_TEMPLATE_RENDERERS = {
  invitation: renderInvitationEmail,
  verification: renderVerificationEmail,
  'password-reset': renderPasswordResetEmail,
  welcome: renderWelcomeEmail,
  'trial-day-1': renderTrialDayOneEmail,
  'trial-day-3': renderTrialDayThreeEmail,
  'trial-day-6': renderTrialDaySixEmail,
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_RENDERERS;
