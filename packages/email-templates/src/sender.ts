function senderAddress(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from;
}

export function viaOpenDealBook(name: string, from: string): string {
  const displayName = `${name} via Open Deal Book`.replace(/["\\]/g, '\\$&');

  return `"${displayName}" <${senderAddress(from)}>`;
}

export function personalSender(
  person: { name: string; email: string | null },
  from: string,
): { from: string; replyTo: string } {
  return {
    from: viaOpenDealBook(person.name, from),
    replyTo: person.email ?? senderAddress(from),
  };
}
