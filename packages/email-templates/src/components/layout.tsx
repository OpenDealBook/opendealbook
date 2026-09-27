import type { ReactNode } from 'react';

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from 'react-email';

interface EmailLayoutProps {
  preview: string;
  heading: string;
  productName: string;
  children: ReactNode;
}

export function EmailLayout({
  preview,
  heading,
  productName,
  children,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-[#fafafa] font-sans text-[#242424]">
          <Container className="mx-auto max-w-[600px] px-[20px] py-[40px]">
            <Section className="rounded-xl bg-white px-[40px] py-[32px]">
              <Heading className="m-0 text-[22px] font-semibold text-[#242424]">
                {heading}
              </Heading>
              {children}
            </Section>
            <Hr className="my-[24px] border border-solid border-[#eaeaea]" />
            <Text className="text-[12px] text-[#8898aa]">{productName}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
