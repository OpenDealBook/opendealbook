import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface TodoAssignedEmailProps {
  productName: string;
  assignerName: string;
  dealName: string;
  title: string;
  actionLink: string;
}

export function renderTodoAssignedEmail(
  props: TodoAssignedEmailProps,
): Promise<RenderedEmail> {
  const subject = `${props.assignerName} assigned you a to-do on ${props.dealName}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">{props.title}</Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.actionLink}>Open the to-dos</EmailButton>
      </Section>
    </EmailLayout>,
    subject,
  );
}
