import { renderInvitationEmail } from './emails/invitation.email';
import { renderPasswordResetEmail } from './emails/password-reset.email';
import { renderVerificationEmail } from './emails/verification.email';
import { renderWelcomeEmail } from './emails/welcome.email';

export const EMAIL_TEMPLATE_RENDERERS = {
  invitation: renderInvitationEmail,
  verification: renderVerificationEmail,
  'password-reset': renderPasswordResetEmail,
  welcome: renderWelcomeEmail,
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_RENDERERS;
