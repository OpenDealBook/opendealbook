import { Link, Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface WelcomeEmailProps {
  productName: string;
  userName?: string;
  actionLink?: string;
  importLink?: string;
}

export function renderWelcomeEmail(
  props: WelcomeEmailProps,
): Promise<RenderedEmail> {
  const subject = `Welcome to ${props.productName}`;
  const heading = props.userName ? `Welcome, ${props.userName}` : 'Welcome';

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={heading}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        Thanks for joining {props.productName}. The quickest way to see how it
        works is to set up your first deal and start running the process in one
        place.
      </Text>
      {props.actionLink ? (
        <Section className="my-[24px] text-center">
          <EmailButton href={props.actionLink}>
            Create your first deal
          </EmailButton>
        </Section>
      ) : null}
      {props.importLink ? (
        <Text className="text-[14px] leading-[24px]">
          Already running a pipeline? Import it and pick up where your team left
          off:{' '}
          <Link href={props.importLink} className="text-blue-600">
            import a pipeline
          </Link>
          .
        </Text>
      ) : null}
    </EmailLayout>,
    subject,
  );
}
