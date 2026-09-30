export type OutreachStep = {
  ordinal: number;
  delayDays: number;
  subject: string;
  body: string;
};

export type OutreachSequence = {
  key: string;
  name: string;
  description: string;
  steps: OutreachStep[];
};

export const DEFAULT_OUTREACH_SEQUENCES: OutreachSequence[] = [
  {
    key: 'cold-deal-box-match',
    name: 'Deal-box match',
    description:
      'Single cold touch to an owner whose business fits the operator deal box, opening the door to a call about a sale.',
    steps: [
      {
        ordinal: 1,
        delayDays: 0,
        subject: 'RE: {{ firm.name }}',
        body: [
          'Hi {{ recipient.name | there }},',
          '',
          'I am looking to acquire a {{ dealBox.industries }} business around {{ dealBox.revenueRange }} in revenue, and {{ firm.name }} keeps coming up.',
          '',
          'Would you be open to a quick call about what a sale could look like? Either way, I value your time.',
          '',
          'Best,',
          '{{ sender.name }}',
        ].join('\n'),
      },
    ],
  },
  {
    key: 'cold-impressed-partner',
    name: 'Impressed / partner',
    description:
      'Single cold touch that leads with genuine interest in the business and asks for a call about working together.',
    steps: [
      {
        ordinal: 1,
        delayDays: 0,
        subject: 'Quick question',
        body: [
          'Hi {{ recipient.name | there }},',
          '',
          'I came across {{ firm.name }} and was impressed by what you have built. I run {{ sender.company }}.',
          '',
          'Would you be open to a short call about working together?',
          '',
          'Best,',
          '{{ sender.name }}',
        ].join('\n'),
      },
    ],
  },
];

export const REFERENCE_FOLLOW_UP_BODY = [
  'Hi {{ recipient.name | there }},',
  '',
  'Floating this back to the top of your inbox in case it slipped by. Still happy to find a time that works for you.',
  '',
  'Best,',
  '{{ sender.name }}',
].join('\n');
