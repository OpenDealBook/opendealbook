import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuckin/ui/tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Base/Tabs',
  component: Tabs,
};

export default meta;

type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" style={{ width: 420 }}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Deal snapshot and key terms.</TabsContent>
      <TabsContent value="documents">Data room files and versions.</TabsContent>
      <TabsContent value="activity">
        Recent comments and status changes.
      </TabsContent>
    </Tabs>
  ),
};
