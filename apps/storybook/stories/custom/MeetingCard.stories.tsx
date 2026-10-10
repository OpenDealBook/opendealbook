import type { Meta, StoryObj } from '@storybook/react-vite';

import { MeetingCard } from '@odb/ui/meeting-card';

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

export const Held: Story = {
  args: { status: 'held', title: 'IC pre-read walkthrough' },
};

export const Skipped: Story = {
  args: { status: 'skipped', title: 'Weekly sync' },
};

export const Cancelled: Story = {
  args: { status: 'cancelled', title: 'Site visit' },
};
