export type MergeContext = {
  recipient?: { name?: string; email?: string; firstName?: string };
  firm?: { name?: string; industry?: string; city?: string; state?: string; website?: string };
  dealBox?: { revenueRange?: string; industries?: string };
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

export function mergeFieldTokens(): string[] {
  return [
    'recipient.name',
    'recipient.email',
    'recipient.firstName',
    'firm.name',
    'firm.industry',
    'firm.city',
    'firm.state',
    'firm.website',
    'dealBox.revenueRange',
    'dealBox.industries',
    'sender.name',
    'sender.company',
    'sender.email',
  ];
}
