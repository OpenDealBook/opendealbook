import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface TrialDayThreeEmailProps {
  productName: string;
  userName?: string;
  actionLink: string;
}

export function TrialDayThreeEmail({
  productName,
  userName,
  actionLink,
}: TrialDayThreeEmailProps) {
  return (
    <EmailLayout
      preview={`Run diligence, comparables, and underwriting in ${productName}`}
      heading={`Where ${productName} fits your process`}
      productName={productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {userName ? `${userName}, teams` : 'Teams'} running roll-ups and
        multi-target acquisitions need the whole process in one system, not
        scattered across tools. {productName} covers the work your deal team
        repeats on every target:
      </Text>
      <Text className="text-[16px] leading-[24px]">
        Track each target through a shared pipeline. Run diligence against a
        consistent checklist. Pull comparables to sense-check valuation. Model
        DSCR underwriting on the same record. When a deal needs to move, the
        context is already there.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={actionLink}>Explore your workspace</EmailButton>
      </Section>
    </EmailLayout>
  );
}

TrialDayThreeEmail.PreviewProps = {
  productName: 'Open Deal Book',
  userName: 'Ada',
  actionLink: 'https://opendealbook.app/workspace',
} satisfies TrialDayThreeEmailProps;

export function renderTrialDayThreeEmail(
  props: TrialDayThreeEmailProps,
): Promise<RenderedEmail> {
  const subject = `Run diligence and comparables in ${props.productName}`;

  return renderTemplate(<TrialDayThreeEmail {...props} />, subject);
}

export default TrialDayThreeEmail;
