import type { Meta, StoryObj } from '@storybook/react-vite';

import { MeetingCard } from '@tuckin/ui/meeting-card';

const meta: Meta<typeof MeetingCard> = {
  title: 'Custom/MeetingCard',
  component: MeetingCard,
  args: {
    title: 'Management presentation',
    startsAt: '2026-09-29T16:00:00Z',
    durationMins: 60,
    attendees: ['Jordan Rivera', 'Priya Osei', 'Marcus Tan'],
    status: 'scheduled',
    joinUrl: 'https://meet.example.com/acme-mgmt',
  },
};

export default meta;

type Story = StoryObj<typeof MeetingCard>;

export const Default: Story = {};

export const Completed: Story = {
  args: { status: 'completed', title: 'IC pre-read walkthrough' },
};
