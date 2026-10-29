export type MergeContext = {
  recipient?: { name?: string; email?: string; firstName?: string };
  firm?: { name?: string; industry?: string; city?: string; state?: string; website?: string };
  dealBox?: {
    revenueRange?: string;
    industries?: string;
    industryPhrase?: string;
    revenuePhrase?: string;
  };
  sender?: { name?: string; company?: string; email?: string };
};

const TOKEN = /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export function renderTemplate(template: string, context: MergeContext): string {
  return template.replace(TOKEN, (_match, path: string, fallback: string | undefined) => {
    const value = path.split('.').reduce<unknown>((node, key) => {
      return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
    }, context);
    if (typeof value === 'string' && value !== '') return value;
    return fallback ?? '';
  });
}

export const MERGE_FIELD_LABELS: Record<string, string> = {
  'recipient.name': 'Recipient name',
  'recipient.email': 'Recipient email',
  'recipient.firstName': 'Recipient first name',
  'firm.name': 'Firm name',
  'firm.industry': 'Firm industry',
  'firm.city': 'Firm city',
  'firm.state': 'Firm state',
  'firm.website': 'Firm website',
  'dealBox.revenueRange': 'Deal box revenue range',
  'dealBox.industries': 'Deal box industries',
  'dealBox.industryPhrase': 'Deal box industry phrase',
  'dealBox.revenuePhrase': 'Deal box revenue phrase',
  'sender.name': 'Sender name',
  'sender.company': 'Sender company',
  'sender.email': 'Sender email',
};

export function mergeFieldTokens(): string[] {
  return Object.keys(MERGE_FIELD_LABELS);
}

export const SEQUENCE_LETTER_FIELDS = mergeFieldTokens().filter((token) => token !== 'sender.email');

export const TEMPLATE_LETTER_FIELDS = [
  'firm.name',
  'firm.industry',
  'firm.city',
  'firm.state',
  'firm.website',
  'sender.name',
  'sender.company',
];

export function dealBoxMergeFields(dealBox: {
  industries?: string;
  revenueRange?: string;
}): NonNullable<MergeContext['dealBox']> {
  return {
    ...dealBox,
    industryPhrase: dealBox.industries ? `${dealBox.industries} business` : 'business',
    revenuePhrase: dealBox.revenueRange ? ` around ${dealBox.revenueRange} in revenue` : '',
  };
}
