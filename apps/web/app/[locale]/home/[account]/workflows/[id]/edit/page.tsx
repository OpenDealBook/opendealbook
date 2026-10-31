import { notFound } from 'next/navigation';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { workflowGraphSchema } from '@odb/workflows/builder/client';
import type { EditorLayout } from '@odb/workflows/builder/editor';
import { paletteNodeTypes } from '@odb/workflows/builder/editor/palette';

import { areUuids } from '../../../../_components/lender-page-params';
import { WorkflowEditor } from '../../../../_components/workflow-editor';
import { loadTeamWorkspace } from '../../../layout';
import {
  publishDraft,
  retryScheduleSync,
  saveDraft,
} from '../../editor-actions';

const UNSAVED_LAYOUT: EditorLayout = { direction: 'RIGHT', positions: {} };

export default async function WorkflowEditPage(props: {
  params: Promise<{ account: string; id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { account, id } = await props.params;
  const { version } = await props.searchParams;

  if (!areUuids(id) || (version !== undefined && !areUuids(version))) {
    notFound();
  }

  const { team, permissions } = await loadTeamWorkspace(account);
  const client = getSupabaseServerClient();

  const [{ data: workflow }, { data: versions }] = await Promise.all([
    client
      .from('workflow')
      .select('id, name, schedules_sync_failed_at')
      .eq('id', id)
      .eq('account_id', team.id)
      .maybeSingle()
      .throwOnError(),
    client
      .from('workflow_version')
      .select('id, published_at, graph, layout')
      .eq('workflow_id', id)
      .eq('account_id', team.id)
      .order('published_at', { ascending: false, nullsFirst: true })
      .throwOnError(),
  ]);

  if (!workflow) {
    notFound();
  }

  const published = versions.filter((each) => each.published_at !== null);
  const shown =
    version === undefined
      ? (versions.find((each) => each.published_at === null) ?? published[0])
      : published.find((each) => each.id === version);

  if (!shown) {
    notFound();
  }

  const workflowPath = `/home/${account}/workflows/${id}`;

  return (
    <WorkflowEditor
      workflowId={id}
      workflowName={workflow.name}
      workflowPath={workflowPath}
      published={published.map((each) => ({ id: each.id }))}
      viewing={version ?? null}
      version={{
        graph: workflowGraphSchema.parse(shown.graph),
        layout:
          Object.keys(shown.layout as object).length === 0
            ? UNSAVED_LAYOUT
            : (shown.layout as unknown as EditorLayout),
      }}
      palette={paletteNodeTypes()}
      canManage={permissions.includes('workflows.manage')}
      schedulesSyncFailed={workflow.schedules_sync_failed_at !== null}
      saveDraft={saveDraft}
      publishDraft={publishDraft}
      retryScheduleSync={retryScheduleSync}
    />
  );
}
