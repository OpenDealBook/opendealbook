import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface TrialDaySixEmailProps {
  productName: string;
  userName?: string;
  upgradeLink: string;
}

export function TrialDaySixEmail({
  productName,
  userName,
  upgradeLink,
}: TrialDaySixEmailProps) {
  const heading = userName ? `Keep your deals moving, ${userName}` : 'Keep your deals moving';

  return (
    <EmailLayout
      preview={`Your ${productName} trial ends soon`}
      heading={heading}
      productName={productName}
    >
      <Text className="text-[16px] leading-[24px]">
        Your {productName} trial ends soon. Choose a plan to keep your pipeline,
        diligence, comparables, and underwriting in one place as your deals
        progress.
      </Text>
      <Text className="text-[16px] leading-[24px]">
        If you would rather run {productName} on your own infrastructure, it is
        self-hostable, so your deal data stays under your control.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={upgradeLink}>Choose your plan</EmailButton>
      </Section>
    </EmailLayout>
  );
}

TrialDaySixEmail.PreviewProps = {
  productName: 'Open Deal Book',
  userName: 'Ada',
  upgradeLink: 'https://opendealbook.app/billing/plans',
} satisfies TrialDaySixEmailProps;

export function renderTrialDaySixEmail(
  props: TrialDaySixEmailProps,
): Promise<RenderedEmail> {
  const subject = `Your ${props.productName} trial ends soon`;

  return renderTemplate(<TrialDaySixEmail {...props} />, subject);
}

export default TrialDaySixEmail;
