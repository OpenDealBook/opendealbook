import { Link, Text } from 'react-email';

import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface DealUpdateEmailProps {
  productName: string;
  teamName: string;
  dealName: string;
  subject: string;
  body: string;
  links: { label: string; href: string }[];
}

export function renderDealUpdateEmail(
  props: DealUpdateEmailProps,
): Promise<RenderedEmail> {
  return renderTemplate(
    <EmailLayout
      preview={props.subject}
      heading={props.subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px] whitespace-pre-wrap">
        {props.body}
      </Text>
      {props.links.map((link) => (
        <Text key={link.href} className="text-[14px] leading-[24px]">
          <Link href={link.href} className="text-blue-600">
            {link.label}
          </Link>
        </Text>
      ))}
      <Text className="text-[12px] leading-[20px] text-[#8898aa]">
        {props.teamName} sent you this update about {props.dealName}. Deal
        updates are sent regardless of notification settings.
      </Text>
    </EmailLayout>,
    props.subject,
  );
}
