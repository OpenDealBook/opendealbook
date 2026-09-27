import { Section, Text } from 'react-email';

import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface VerificationEmailProps {
  productName: string;
  otp: string;
}

export function renderVerificationEmail(
  props: VerificationEmailProps,
): Promise<RenderedEmail> {
  const subject = `Your ${props.productName} verification code`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading="Verify your email"
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        Enter the following code to verify your email address.
      </Text>
      <Section className="my-[24px] text-center">
        <Text className="text-[28px] font-semibold tracking-[6px] text-[#242424]">
          {props.otp}
        </Text>
      </Section>
      <Text className="text-[14px] leading-[24px] text-[#8898aa]">
        If you did not request this code you can safely ignore this email.
      </Text>
    </EmailLayout>,
    subject,
  );
}
