import { Link, Section, Text } from 'react-email';

import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerActivityDigestRoom {
  title: string;
  link: string;
  lines: string[];
}

export interface SellerActivityDigestEmailProps {
  productName: string;
  subject: string;
  heading: string;
  rooms: SellerActivityDigestRoom[];
}

export function renderSellerActivityDigestEmail(
  props: SellerActivityDigestEmailProps,
): Promise<RenderedEmail> {
  return renderTemplate(
    <EmailLayout
      preview={props.subject}
      heading={props.heading}
      productName={props.productName}
    >
      {props.rooms.map((room) => (
        <Section key={room.link} className="my-[16px]">
          <Link
            href={room.link}
            className="text-[16px] font-semibold text-blue-600"
          >
            {room.title}
          </Link>
          {room.lines.map((line, index) => (
            <Text key={index} className="my-[4px] text-[14px] leading-[20px]">
              {line}
            </Text>
          ))}
        </Section>
      ))}
    </EmailLayout>,
    props.subject,
  );
}
