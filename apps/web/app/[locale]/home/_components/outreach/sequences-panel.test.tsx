import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@odb/outreach-app/server', () => ({
  createSequence: vi.fn(),
  seedDefaultSequences: vi.fn(),
  updateSequence: vi.fn(),
}));

import { SequencesPanel } from './sequences-panel';

describe('SequencesPanel', () => {
  it('names a letter step "Letter" and an email step by its subject', () => {
    const html = renderToStaticMarkup(
      <SequencesPanel
        accountId={'a0000000-0000-4000-8000-000000000001'}
        sequences={[
          {
            id: 's-1',
            name: 'Mixed',
            description: null,
            enabled: true,
            isDefault: false,
            steps: [
              {
                ordinal: 1,
                delayDays: 0,
                channel: 'email',
                subject: 'Quick question',
                body: 'Email body',
              },
              {
                ordinal: 2,
                delayDays: 7,
                channel: 'letter',
                subject: null,
                body: 'Letter body',
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain('Quick question');
    expect(html).toContain('<p class="font-medium">Letter</p>');
    expect(html).toContain('Letter body');
  });

  it('disables Edit on a sequence with a letter step and says why', () => {
    const html = renderToStaticMarkup(
      <SequencesPanel
        accountId={'a0000000-0000-4000-8000-000000000001'}
        sequences={[
          {
            id: 's-letter',
            name: 'With letter',
            description: null,
            enabled: true,
            isDefault: false,
            steps: [
              {
                ordinal: 1,
                delayDays: 0,
                channel: 'letter',
                subject: null,
                body: 'Letter body',
              },
            ],
          },
          {
            id: 's-email',
            name: 'Email only',
            description: null,
            enabled: true,
            isDefault: false,
            steps: [
              {
                ordinal: 1,
                delayDays: 0,
                channel: 'email',
                subject: 'Hi',
                body: 'Email body',
              },
            ],
          },
        ]}
      />,
    );

    const editButtons = html.match(/<button[^>]*>Edit<\/button>/g) ?? [];
    expect(editButtons).toHaveLength(2);
    expect(editButtons[0]).toContain('disabled=""');
    expect(editButtons[1]).not.toContain('disabled=""');
    expect(html.match(/Letter steps can&#x27;t be edited yet\./g)).toHaveLength(
      1,
    );
  });
});
