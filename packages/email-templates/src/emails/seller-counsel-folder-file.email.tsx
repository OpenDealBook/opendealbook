import { Section, Text } from 'react-email';

import { EmailButton } from '../components/button';
import { EmailLayout } from '../components/layout';
import { renderTemplate, type RenderedEmail } from '../lib/render-template';

export interface SellerCounselFolderFileEmailProps {
  productName: string;
  uploaderName: string;
  fileName: string;
  fileCount: number;
  businessName: string;
  actionLink: string;
}

export function renderSellerCounselFolderFileEmail(
  props: SellerCounselFolderFileEmailProps,
): Promise<RenderedEmail> {
  const subject =
    props.fileCount > 1
      ? "New files in the Seller's counsel folder"
      : "New file in the Seller's counsel folder";

  return renderTemplate(
    <EmailLayout
      preview={subject}
      heading={subject}
      productName={props.productName}
    >
      <Text className="text-[16px] leading-[24px]">
        {`${props.uploaderName} added ${props.fileName} to the Seller's counsel folder for ${props.businessName}.`}
      </Text>
      <Section className="my-[24px] text-center">
        <EmailButton href={props.actionLink}>Open the folder</EmailButton>
      </Section>
    </EmailLayout>,
    subject,
  );
}
