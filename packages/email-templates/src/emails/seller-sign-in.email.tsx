import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout, FallbackLink } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerSignInEmailProps {
  productName: string;
  deals: { name: string; outsideName: string }[];
  signInLink: string;
}

export function renderSellerSignInEmail(
  props: SellerSignInEmailProps,
): Promise<RenderedEmail> {
  const list = new Intl.ListFormat('en');
  const deals = list.format(props.deals.map((deal) => deal.name));
  const subject = `Your sign-in link for ${list.format(
    props.deals.map((deal) => deal.outsideName),
  )}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading="Your sign-in link"
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        Use the button below to sign in to your room for {deals}. The link can
        be used once.
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.signInLink}>Open your room</EmailButton>
      </Section>
      <FallbackLink href={props.signInLink} />
    </EmailLayout>,
    subject,
  );
}
