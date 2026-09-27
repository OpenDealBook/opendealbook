import { Link, Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface PasswordResetEmailProps {
  productName: string;
  resetLink: string;
}

export function renderPasswordResetEmail(
  props: PasswordResetEmailProps,
): Promise<RenderedEmail> {
  const subject = `Reset your ${props.productName} password`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading="Reset your password"
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        We received a request to reset your password. Choose a new one using the
        button below.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.resetLink}>Reset password</EmailButton>
      </Section>
      <Text className="text-[14px] leading-[24px]">
        Or paste this link into your browser:{' '}
        <Link href={props.resetLink} className="text-blue-600">
          {props.resetLink}
        </Link>
      </Text>
      <Text className="text-[12px] text-[#8898aa]">
        If you did not request a password reset you can ignore this email.
      </Text>
    </EmailLayout>,
    subject,
  );
}
