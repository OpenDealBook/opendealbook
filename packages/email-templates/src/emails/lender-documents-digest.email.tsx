import { Heading, Link, Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface LenderDigestRoom {
  name: string;
  link: string;
  documents: { name: string; status: 'new' | 'updated' }[];
  moreCount: number;
}

export interface LenderDocumentsDigestEmailProps {
  productName: string;
  rooms: LenderDigestRoom[];
}

export function renderLenderDocumentsDigestEmail(
  props: LenderDocumentsDigestEmailProps,
): Promise<RenderedEmail> {
  const documentCount = props.rooms.reduce(
    (count, room) => count + room.documents.length + room.moreCount,
    0,
  );
  const subject = `${documentCount} new or updated ${
    documentCount === 1 ? 'document' : 'documents'
  } in your lender ${props.rooms.length === 1 ? 'room' : 'rooms'}`;

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
          {room.documents.map((document, index) => (
            <Text key={index} className="m-0 text-[16px] leading-[24px]">
              {`${document.name} (${document.status})`}
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
