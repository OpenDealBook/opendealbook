// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TEMPLATE } from '@odb/lender-outreach/default-template.ts';

import {
  alerts,
  clearScreen,
  dialogText,
  fakeServer,
  field,
  press,
  show,
  type,
} from '../lender-test-kit';
import { OutreachTemplateForm, QuietDaysForm } from './lender-settings';

vi.mock(
  'next/navigation',
  async () => (await import('../lender-test-kit')).navigation,
);
vi.mock('@odb/lender-rooms/crm/nudges/actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions('setQuietDays'),
);
vi.mock('@odb/lender-outreach/template-actions.ts', async () =>
  (await import('../lender-test-kit')).fakeActions(
    'saveOutreachTemplate',
    'resetOutreachTemplate',
  ),
);

const TEAM = '2c1f2c0e-6c0f-4f43-9c53-0d7a4c1f1a11';

beforeEach(() => fakeServer.reset());

afterEach(clearScreen);

describe('quiet days', () => {
  it('opens with the saved number and saves a new one', async () => {
    show(<QuietDaysForm accountId={TEAM} quietDays={5} />);

    expect(field('Days quiet before a nudge').value).toBe('5');

    await type('Days quiet before a nudge', '7');
    await press('Save quiet days');

    expect(fakeServer.inputsTo('setQuietDays')).toEqual([
      { accountId: TEAM, quietDays: 7 },
    ]);
    expect(fakeServer.refreshes).toBe(1);
  });

  it('shows why saving is refused', async () => {
    fakeServer.refusal = 'Only the deal team can do that';
    show(<QuietDaysForm accountId={TEAM} quietDays={5} />);

    await type('Days quiet before a nudge', '7');
    await press('Save quiet days');

    expect(alerts()).toEqual(['Only the deal team can do that']);
    expect(fakeServer.refreshes).toBe(0);
  });
});

describe('the outreach template', () => {
  it('saves the edited subject and body', async () => {
    show(<OutreachTemplateForm accountId={TEAM} template={DEFAULT_TEMPLATE} />);

    await type('Subject', '{{dealName}} financing');
    await type('Body', 'Hi {{contactName}}, see {{roomLink}}');
    await press('Save template');

    expect(fakeServer.inputsTo('saveOutreachTemplate')).toEqual([
      {
        accountId: TEAM,
        subject: '{{dealName}} financing',
        body: 'Hi {{contactName}}, see {{roomLink}}',
      },
    ]);
  });

  it('shows an unknown field the server refuses', async () => {
    fakeServer.refusalFor.saveOutreachTemplate = 'Unknown field {{dealname}}';
    show(<OutreachTemplateForm accountId={TEAM} template={DEFAULT_TEMPLATE} />);

    await type('Subject', '{{dealname}}');
    await press('Save template');

    expect(alerts()).toEqual(['Unknown field {{dealname}}']);
  });

  it('resets a saved template back to the default wording', async () => {
    show(
      <OutreachTemplateForm
        accountId={TEAM}
        template={{ subject: 'Our own subject', body: 'Our own body' }}
      />,
    );

    await press('Reset to default');

    expect(fakeServer.inputsTo('resetOutreachTemplate')).toEqual([]);
    expect(dialogText()).toContain('Reset the outreach template?');

    await press('Reset template');

    expect(fakeServer.inputsTo('resetOutreachTemplate')).toEqual([
      { accountId: TEAM },
    ]);
    expect(field('Subject').value).toBe(DEFAULT_TEMPLATE.subject);
    expect(field('Body').value).toBe(DEFAULT_TEMPLATE.body);
  });
});
