import type { StorybookConfig } from '@storybook/react-vite';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Custom component stories are authored ahead of the components they document;
// each one loads only once its source lands in @odb/ui, so the catalog keeps
// building while that lane is in flight.
const uiComponents = join(process.cwd(), '../../packages/ui/src/components');

const customStories: Array<[componentFile: string, storyGlob: string]> = [
  ['deal-switcher.tsx', '../stories/custom/DealSwitcher.stories.tsx'],
  ['stage-chip.tsx', '../stories/custom/StageChip.stories.tsx'],
  ['status-dropdown.tsx', '../stories/custom/StatusDropdown.stories.tsx'],
  ['checklist-table.tsx', '../stories/custom/ChecklistTable.stories.tsx'],
  ['document-card.tsx', '../stories/custom/DocumentCard.stories.tsx'],
  ['redline-diff.tsx', '../stories/custom/RedlineDiff.stories.tsx'],
  ['meeting-card.tsx', '../stories/custom/MeetingCard.stories.tsx'],
  ['template-field.tsx', '../stories/custom/TemplateField.stories.tsx'],
];

const readyCustomStories = customStories
  .filter(([componentFile]) => existsSync(join(uiComponents, componentFile)))
  .map(([, storyGlob]) => storyGlob);

const config: StorybookConfig = {
  stories: [
    '../stories/tokens/**/*.stories.@(ts|tsx|mdx)',
    '../stories/base/**/*.stories.@(ts|tsx|mdx)',
    ...readyCustomStories,
  ],
  addons: ['@storybook/addon-themes'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    viteConfig.plugins = viteConfig.plugins ?? [];
    viteConfig.plugins.push(tailwindcss());
    return viteConfig;
  },
};

export default config;
