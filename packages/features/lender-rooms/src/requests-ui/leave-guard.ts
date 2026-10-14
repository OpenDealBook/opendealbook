export function interceptsLink(
  link: {
    href: string;
    target: string;
    isDownload: boolean;
    withModifier: boolean;
  },
  here: string,
): boolean {
  const to = new URL(link.href, here);
  const from = new URL(here);

  return (
    to.origin === from.origin &&
    to.pathname !== from.pathname &&
    link.target !== '_blank' &&
    !link.isDownload &&
    !link.withModifier
  );
}
