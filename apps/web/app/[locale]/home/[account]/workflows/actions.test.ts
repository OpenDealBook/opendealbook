import { beforeEach, describe, expect, it, vi } from 'vitest';

const WORKFLOW_ID = '00000000-0000-4000-8000-000000000001';
const REQUEST_ID = '00000000-0000-4000-8000-0000000000aa';

const world = vi.hoisted(() => ({
  canManage: true,
  published: true,
  workflow: { enabled: false, archived_at: null as string | null },
  startManualWorkflowRun: vi.fn(),
}));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (input: unknown, user: { id: string }) => Promise<unknown>) =>
    (input: unknown) =>
      fn(input, { id: 'user-1' }),
}));

vi.mock('@odb/workflows/builder/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  startManualWorkflowRun: world.startManualWorkflowRun,
}));

function settled<Value>(result: { data: Value; error: unknown }) {
  return {
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
    throwOnError: async () => {
      if (result.error) {
        throw result.error;
      }
      return result;
    },
  };
}

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => ({
    rpc: (name: string, args: { permission_name: string }) =>
      settled({
        data:
          name === 'has_permission' &&
          args.permission_name === 'workflows.manage' &&
          world.canManage,
        error: null,
      }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            settled({
              data: {
                account_id: 'team-1',
                archived_at: world.workflow.archived_at,
              },
              error: null,
            }),
        }),
      }),
      update: (patch: Partial<typeof world.workflow>) => ({
        eq: () => {
          const next = { ...world.workflow, ...patch };

          if (!world.canManage) {
            return settled({ data: null, error: null });
          }
          if (next.enabled && !world.published) {
            return settled({
              data: null,
              error: {
                code: '23514',
                message: 'a workflow needs a published version to be enabled',
              },
            });
          }
          if (next.enabled && next.archived_at !== null) {
            return settled({
              data: null,
              error: {
                code: '23514',
                message:
                  'new row for relation "workflow" violates check constraint "workflow_archived_disabled_check"',
              },
            });
          }
          world.workflow = next;

          return settled({ data: null, error: null });
        },
      }),
    }),
  }),
}));

const { setWorkflowEnabled, setWorkflowArchived, runWorkflowNow } =
  await import('./actions');
const { ManualRunRefused } = await import('@odb/workflows/builder/client');

beforeEach(() => {
  world.canManage = true;
  world.published = true;
  world.workflow = { enabled: false, archived_at: null };
  world.startManualWorkflowRun.mockReset();
});

describe('setWorkflowEnabled', () => {
  it('enables a published workflow', async () => {
    expect(
      await setWorkflowEnabled({ workflowId: WORKFLOW_ID, enabled: true }),
    ).toEqual({ ok: true, value: undefined });
    expect(world.workflow.enabled).toBe(true);
  });

  it('disables an enabled workflow', async () => {
    world.workflow.enabled = true;

    await setWorkflowEnabled({ workflowId: WORKFLOW_ID, enabled: false });

    expect(world.workflow.enabled).toBe(false);
  });

  it('tells the manager to publish first when the workflow has no published version', async () => {
    world.published = false;

    expect(
      await setWorkflowEnabled({ workflowId: WORKFLOW_ID, enabled: true }),
    ).toEqual({ ok: false, refusal: 'Publish this workflow first' });
    expect(world.workflow.enabled).toBe(false);
  });

  it('tells the manager to unarchive first when the workflow is archived', async () => {
    world.workflow.archived_at = '2026-10-01T00:00:00Z';

    expect(
      await setWorkflowEnabled({ workflowId: WORKFLOW_ID, enabled: true }),
    ).toEqual({ ok: false, refusal: 'Unarchive this workflow first' });
    expect(world.workflow.enabled).toBe(false);
  });

  it('refuses a member without workflows.manage', async () => {
    world.canManage = false;

    expect(
      await setWorkflowEnabled({ workflowId: WORKFLOW_ID, enabled: true }),
    ).toEqual({
      ok: false,
      refusal: 'Changing a workflow needs workflows.manage',
    });
    expect(world.workflow.enabled).toBe(false);
  });
});

describe('setWorkflowArchived', () => {
  it('archives an enabled workflow and disables it', async () => {
    world.workflow.enabled = true;

    expect(
      await setWorkflowArchived({ workflowId: WORKFLOW_ID, archived: true }),
    ).toEqual({ ok: true, value: undefined });
    expect(world.workflow.archived_at).not.toBeNull();
    expect(world.workflow.enabled).toBe(false);
  });

  it('unarchives a workflow as disabled', async () => {
    world.workflow.archived_at = '2026-10-01T00:00:00Z';

    await setWorkflowArchived({ workflowId: WORKFLOW_ID, archived: false });

    expect(world.workflow).toEqual({ enabled: false, archived_at: null });
  });

  it('refuses a member without workflows.manage', async () => {
    world.canManage = false;

    expect(
      await setWorkflowArchived({ workflowId: WORKFLOW_ID, archived: true }),
    ).toEqual({
      ok: false,
      refusal: 'Changing a workflow needs workflows.manage',
    });
    expect(world.workflow.archived_at).toBeNull();
  });
});

describe('runWorkflowNow', () => {
  it('starts a manual run under the given request id and returns its id', async () => {
    world.startManualWorkflowRun.mockResolvedValue({ runId: 'run-1' });

    expect(
      await runWorkflowNow({ workflowId: WORKFLOW_ID, requestId: REQUEST_ID }),
    ).toEqual({ ok: true, value: { runId: 'run-1' } });
    expect(world.startManualWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: WORKFLOW_ID,
        requestId: REQUEST_ID,
      }),
    );
  });

  it.each([
    ['not_published', 'Publish this workflow first'],
    ['archived', 'This workflow is archived'],
    ['not_permitted', 'Running a workflow needs workflows.manage'],
  ] as const)('passes on the %s run refusal', async (reason, message) => {
    world.startManualWorkflowRun.mockRejectedValue(
      new ManualRunRefused(reason),
    );

    expect(await runWorkflowNow({ workflowId: WORKFLOW_ID, requestId: REQUEST_ID })).toEqual({
      ok: false,
      refusal: message,
    });
  });

  it('fails loudly on an error that is not a refusal', async () => {
    world.startManualWorkflowRun.mockRejectedValue(new Error('temporal down'));

    await expect(runWorkflowNow({ workflowId: WORKFLOW_ID, requestId: REQUEST_ID })).rejects.toThrow(
      'temporal down',
    );
  });
});
