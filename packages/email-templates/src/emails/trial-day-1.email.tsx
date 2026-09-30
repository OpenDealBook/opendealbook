import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface TrialDayOneEmailProps {
  productName: string;
  userName?: string;
  actionLink: string;
}

export function TrialDayOneEmail({
  productName,
  userName,
  actionLink,
}: TrialDayOneEmailProps) {
  const heading = userName ? `Get your first deal moving, ${userName}` : 'Get your first deal moving';

  return (
    <EmailLayout
      preview={`Set up your first deal in ${productName}`}
      heading={heading}
      productName={productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {productName} keeps your pipeline, diligence, and comparables in one
        place, so your team can run an acquisition end to end without stitching
        together spreadsheets.
      </Text>
      <Text className="text-[16px] leading-[24px]">
        Start with a single deal. Add a target, and you will see how the
        pipeline and diligence come together as you work.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={actionLink}>Create your first deal</EmailButton>
      </Section>
    </EmailLayout>
  );
}

TrialDayOneEmail.PreviewProps = {
  productName: 'Open Deal Book',
  userName: 'Ada',
  actionLink: 'https://opendealbook.app/deals/new',
} satisfies TrialDayOneEmailProps;

export function renderTrialDayOneEmail(
  props: TrialDayOneEmailProps,
): Promise<RenderedEmail> {
  const subject = `Set up your first deal in ${props.productName}`;

  return renderTemplate(<TrialDayOneEmail {...props} />, subject);
}

export default TrialDayOneEmail;
