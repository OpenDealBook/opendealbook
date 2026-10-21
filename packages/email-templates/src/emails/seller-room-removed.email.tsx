import { Text } from 'react-email';

import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerRoomRemovedEmailProps {
  productName: string;
  removerName: string;
  teamName: string;
  outsideName: string;
  dealName: string;
}

export function renderSellerRoomRemovedEmail(
  props: SellerRoomRemovedEmailProps,
): Promise<RenderedEmail> {
  const subject = `You were removed from the room for ${props.outsideName}`;

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={`You were removed from the room for ${props.dealName}`}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {props.removerName} at {props.teamName} removed you from the room for{' '}
        {props.dealName}. The files you uploaded stay with {props.teamName}.
      </Text>
    </EmailLayout>,
    subject,
  );
}
