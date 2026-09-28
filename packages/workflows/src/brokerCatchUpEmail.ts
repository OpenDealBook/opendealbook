export interface BrokerCatchUpEmailFields {
  brokerFirstName: string;
  updates: string;
  dealBoxSummary: string;
  bookACallUrl: string;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0]!;
}

export function buildBrokerCatchUpEmail(fields: BrokerCatchUpEmailFields): {
  html: string;
  text: string;
} {
  const text = [
    `Hi ${fields.brokerFirstName},`,
    '',
    fields.updates,
    '',
    `What we are looking for right now: ${fields.dealBoxSummary}`,
    '',
    `Book a call: ${fields.bookACallUrl}`,
  ].join('\n');

  const html = [
    `<p>Hi ${fields.brokerFirstName},</p>`,
    `<p>${fields.updates}</p>`,
    `<p>What we are looking for right now: ${fields.dealBoxSummary}</p>`,
    `<p><a href="${fields.bookACallUrl}">Book a call</a></p>`,
  ].join('');

  return { html, text };
}
