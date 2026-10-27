export type OutreachStep = {
  ordinal: number;
  delayDays: number;
  body: string;
} & ({ channel: 'email'; subject: string } | { channel: 'letter' });

export type OutreachSequence = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  steps: OutreachStep[];
};

export const DEFAULT_OUTREACH_SEQUENCES: OutreachSequence[] = [
  {
    key: 'cold-deal-box-match',
    name: 'Deal-box match',
    description:
      'Single cold touch to an owner whose business fits the operator deal box, opening the door to a call about a sale.',
    enabled: true,
    steps: [
      {
        ordinal: 1,
        delayDays: 0,
        channel: 'email',
        subject: 'About {{ firm.name }}',
        body: [
          'Hi {{ recipient.name | there }},',
          '',
          'I am looking to acquire a {{ dealBox.industryPhrase }}{{ dealBox.revenuePhrase }}, and {{ firm.name }} keeps coming up.',
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
    enabled: true,
    steps: [
      {
        ordinal: 1,
        delayDays: 0,
        channel: 'email',
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
  {
    key: 'letter-then-two-emails',
    name: 'Letter, then two emails',
    description:
      'A mailed letter to the owner, then an email 7 days later, then a follow-up email 7 days after that. Edit it, then turn it on.',
    enabled: false,
    steps: [
      {
        ordinal: 1,
        delayDays: 0,
        channel: 'letter',
        body: [
          'Dear owner of {{ firm.name }},',
          '',
          'I am {{ sender.name }} of {{ sender.company }}. I am looking to buy a business like yours and would welcome a conversation about what a sale could look like for you.',
          '',
          'There is no obligation. I will follow up by email next week.',
          '',
          'Sincerely,',
          '{{ sender.name }}',
        ].join('\n'),
      },
      {
        ordinal: 2,
        delayDays: 7,
        channel: 'email',
        subject: 'My letter about {{ firm.name }}',
        body: [
          'Hi {{ recipient.name | there }},',
          '',
          'I recently mailed you a letter about {{ firm.name }}. I am looking to acquire a {{ dealBox.industryPhrase }}{{ dealBox.revenuePhrase }}.',
          '',
          'Would you be open to a short call?',
          '',
          'Best,',
          '{{ sender.name }}',
        ].join('\n'),
      },
      {
        ordinal: 3,
        delayDays: 7,
        channel: 'email',
        subject: 'My letter about {{ firm.name }}',
        body: [
          'Hi {{ recipient.name | there }},',
          '',
          'Following up once more in case my last note slipped by. If now is not the right time, I understand.',
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
