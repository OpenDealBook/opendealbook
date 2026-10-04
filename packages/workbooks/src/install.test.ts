import type { SupabaseClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '@odb/supabase';

import { installWorkbook, listWorkbookTemplates } from './install';
import type { WorkbookScheduleClient } from './schedule';

function makeClient(queue: Array<{ data: unknown; error: unknown }>) {
  const insert = vi.fn(() => builder);
  const builder = {
    select: () => builder,
    insert,
    eq: () => builder,
    single: vi.fn(async () => queue.shift()),
  };

  const client = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient<Database>;

  return { client, insert };
}

const config = {
  dealLeadUserId: 'user-1',
  fromEmail: 'deals@example.com',
  subject: 'Quarterly catch-up',
  updates: 'We closed two deals.',
  bookACallUrl: 'https://cal.example/team',
};

describe('installWorkbook', () => {
  it('validates config against the template type, inserts the workbook and starts the schedule', async () => {
    const { client, insert } = makeClient([
      { data: { workflow_type: 'broker_catch_up' }, error: null },
      { data: { id: 'wb-1', account_id: 'acc-1' }, error: null },
    ]);

    const schedule: WorkbookScheduleClient = {
      startWorkbookSchedule: vi.fn(async () => ({
        scheduleId: 'workbook-wb-1',
      })),
      pauseWorkbookSchedule: vi.fn(async () => undefined),
      resumeWorkbookSchedule: vi.fn(async () => undefined),
    };

    const result = await installWorkbook(
      { accountId: 'acc-1', templateId: 'tmpl-1', config },
      { client, schedule },
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'acc-1',
        template_id: 'tmpl-1',
        status: 'active',
      }),
    );
    expect(schedule.startWorkbookSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        workbookId: 'wb-1',
        accountId: 'acc-1',
        config,
      }),
    );
    expect(result.id).toBe('wb-1');
  });

  it('rejects a config that does not match the template type', async () => {
    const { client } = makeClient([
      { data: { workflow_type: 'broker_catch_up' }, error: null },
    ]);

    const schedule: WorkbookScheduleClient = {
      startWorkbookSchedule: vi.fn(async () => ({
        scheduleId: 'workbook-wb-1',
      })),
      pauseWorkbookSchedule: vi.fn(async () => undefined),
      resumeWorkbookSchedule: vi.fn(async () => undefined),
    };

    await expect(
      installWorkbook(
        {
          accountId: 'acc-1',
          templateId: 'tmpl-1',
          config: { ...config, bookACallUrl: 'nope' },
        },
        { client, schedule },
      ),
    ).rejects.toThrow();

    expect(schedule.startWorkbookSchedule).not.toHaveBeenCalled();
  });
});

describe('listWorkbookTemplates', () => {
  it('returns platform and account templates for the create picker', async () => {
    const templates = [
      { id: 'tmpl-1', name: 'Broker catch-up', workflow_type: 'broker_catch_up' },
    ];
    const or = vi.fn(async () => ({ data: templates, error: null }));
    const select = vi.fn(() => ({ or }));
    const client = {
      from: vi.fn(() => ({ select })),
    } as unknown as SupabaseClient<Database>;

    const result = await listWorkbookTemplates('acc-1', client);

    expect(client.from).toHaveBeenCalledWith('workbook_template');
    expect(or).toHaveBeenCalledWith('account_id.is.null,account_id.eq.acc-1');
    expect(result).toEqual(templates);
  });

  it('throws when the query errors', async () => {
    const or = vi.fn(async () => ({ data: null, error: new Error('nope') }));
    const client = {
      from: vi.fn(() => ({ select: () => ({ or }) })),
    } as unknown as SupabaseClient<Database>;

    await expect(listWorkbookTemplates('acc-1', client)).rejects.toThrow('nope');
  });
});
