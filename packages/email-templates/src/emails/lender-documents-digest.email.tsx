import { Heading, Link, Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export type LenderDigestItem =
  | { kind: 'document'; name: string; status: 'new' | 'updated' }
  | { kind: 'faq'; question: string };

export interface LenderDigestRoom {
  name: string;
  link: string;
  faqLink: string;
  items: LenderDigestItem[];
  moreCount: number;
}

export interface LenderDocumentsDigestEmailProps {
  productName: string;
  rooms: LenderDigestRoom[];
}

export function renderLenderDocumentsDigestEmail(
  props: LenderDocumentsDigestEmailProps,
): Promise<RenderedEmail> {
  const place = `your lender ${props.rooms.length === 1 ? 'room' : 'rooms'}`;
  const onlyDocuments = props.rooms.every((room) =>
    room.items.every((item) => item.kind === 'document'),
  );
  const documentCount = props.rooms.reduce(
    (count, room) => count + room.items.length + room.moreCount,
    0,
  );
  const subject = onlyDocuments
    ? `${documentCount} new or updated ${
        documentCount === 1 ? 'document' : 'documents'
      } in ${place}`
    : `Updates in ${place}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={subject}
      productName={props.productName}
    >
      {props.rooms.map((room) => (
        <Section key={room.link} className="my-[24px]">
          <Heading
            as="h2"
            className="m-0 text-[18px] font-semibold text-[#242424]"
          >
            {room.name}
          </Heading>
          {room.items.map((item, index) => (
            <Text key={index} className="m-0 text-[16px] leading-[24px]">
              {item.kind === 'document' ? (
                `${item.name} (${item.status})`
              ) : (
                <Link href={room.faqLink} className="text-blue-600">
                  {`${item.question} (FAQ)`}
                </Link>
              )}
            </Text>
          ))}
          {room.moreCount > 0 && (
            <Text className="m-0 text-[16px] leading-[24px]">
              <Link href={room.link} className="text-blue-600">
                {`and ${room.moreCount} more`}
              </Link>
            </Text>
          )}
          <Section className="mt-[16px]">
            <EmailButton href={room.link}>{`Open ${room.name}`}</EmailButton>
          </Section>
        </Section>
      ))}
    </EmailLayout>,
    subject,
  );
}
