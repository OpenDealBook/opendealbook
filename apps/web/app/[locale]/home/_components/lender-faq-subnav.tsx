import { LenderSubnav } from './lender-team-subnav';

export function LenderFaqSubnav({ basePath }: { basePath: string }) {
  return (
    <LenderSubnav
      items={[
        { label: 'Rooms', href: basePath },
        { label: 'FAQ', href: `${basePath}/faq` },
      ]}
    />
  );
}
