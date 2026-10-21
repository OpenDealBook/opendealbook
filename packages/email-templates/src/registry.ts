import { renderCounselInviteEmail } from './emails/counsel-invite.email';
import { renderCounselSignInEmail } from './emails/counsel-sign-in.email';
import { renderDealUpdateEmail } from './emails/deal-update.email';
import { renderInvitationEmail } from './emails/invitation.email';
import { renderPasswordResetEmail } from './emails/password-reset.email';
import { renderSellerDeliveryProblemEmail } from './emails/seller-delivery-problem.email';
import { renderSellerDocumentEmail } from './emails/seller-document.email';
import { renderSellerQuestionEmail } from './emails/seller-question.email';
import { renderSellerRoomInviteEmail } from './emails/seller-room-invite.email';
import { renderSellerRoomRemovedEmail } from './emails/seller-room-removed.email';
import { renderSellerSignInEmail } from './emails/seller-sign-in.email';
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
  'seller-document': renderSellerDocumentEmail,
  'seller-question': renderSellerQuestionEmail,
  'seller-room-invite': renderSellerRoomInviteEmail,
  'seller-room-removed': renderSellerRoomRemovedEmail,
  'seller-delivery-problem': renderSellerDeliveryProblemEmail,
  'seller-sign-in': renderSellerSignInEmail,
  'counsel-invite': renderCounselInviteEmail,
  'counsel-sign-in': renderCounselSignInEmail,
  'deal-update': renderDealUpdateEmail,
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_RENDERERS;
