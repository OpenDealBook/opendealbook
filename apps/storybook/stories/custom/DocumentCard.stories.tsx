import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { DocumentCard } from '@tuckin/ui/document-card';

const meta: Meta<typeof DocumentCard> = {
  title: 'Custom/DocumentCard',
  component: DocumentCard,
  args: {
    name: 'Share Purchase Agreement',
    kind: 'contract',
    version: 3,
    updatedAt: '2026-09-26T14:30:00Z',
    onOpen: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof DocumentCard>;

export const Default: Story = {};

export const Spreadsheet: Story = {
  args: {
    name: 'Cap table',
    kind: 'spreadsheet',
    version: 7,
    updatedAt: '2026-09-25T09:15:00Z',
  },
};
