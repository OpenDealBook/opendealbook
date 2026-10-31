'use client';

import { useRef, useState, useSyncExternalStore, useTransition } from 'react';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/next/refusal';
import type { PaletteItem } from '@odb/workflows/builder/editor';
import { Button } from '@odb/ui/button';

import { SCHEDULES_NOT_SYNCED } from '../[account]/workflows/workflow-refusals';
import { UnsavedChangesGuard } from './calc-shared';
import { SchedulesSyncBanner } from './schedules-sync-banner';
import type {
  Draft,
  EditorCanvasHandle,
  NodeError,
} from './workflow-editor-canvas';

const WorkflowEditorCanvas = dynamic(
  () =>
    import('./workflow-editor-canvas').then(
      (module) => module.WorkflowEditorCanvas,
    ),
  { ssr: false },
);

const TABLET_AND_UP = '(min-width: 768px)';

function onWidthChange(notify: () => void) {
  const query = window.matchMedia(TABLET_AND_UP);
  query.addEventListener('change', notify);

  return () => query.removeEventListener('change', notify);
}

function useTabletOrWider(): boolean {
  return useSyncExternalStore(
    onWidthChange,
    () => window.matchMedia(TABLET_AND_UP).matches,
    () => true,
  );
}

type WorkflowInput = { workflowId: string };

function errorsByNode(errors: NodeError[]) {
  const groups = new Map<string | null, { label: string; messages: string[] }>(
    [[null, { label: 'Workflow', messages: [] }]],
  );

  for (const error of errors) {
    const group = groups.get(error.nodeId) ?? {
      label: error.label!,
      messages: [],
    };
    group.messages.push(error.message);
    groups.set(error.nodeId, group);
  }

  return [...groups].filter(([, group]) => group.messages.length > 0);
}

export function WorkflowEditor(props: {
  workflowId: string;
  workflowName: string;
  workflowPath: string;
  published: { id: string }[];
  viewing: string | null;
  version: Draft;
  palette: PaletteItem[];
  canManage: boolean;
  schedulesSyncFailed: boolean;
  saveDraft: (
    input: WorkflowInput & Draft,
  ) => Promise<ActionResult<unknown>>;
  publishDraft: (input: WorkflowInput) => Promise<ActionResult<unknown>>;
  retryScheduleSync: (input: WorkflowInput) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const wide = useTabletOrWider();
  const canvas = useRef<EditorCanvasHandle | null>(null);
  const edits = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<NodeError[]>([]);
  const [pending, startTransition] = useTransition();

  const target = { workflowId: props.workflowId };
  const versionNumber = (id: string) =>
    props.published.length - props.published.findIndex((each) => each.id === id);
  const versionName = (id: string | null) =>
    id === null ? 'Draft' : `Version ${versionNumber(id)}`;
  const versionPath = (id: string | null) =>
    id === null ? `${props.workflowPath}/edit` : `${props.workflowPath}/edit?version=${id}`;
  const editable = props.canManage && props.viewing === null && wide;

  async function accepted(action: Promise<ActionResult<unknown>>) {
    const result = await action;
    setRefusal(result.ok ? null : result.refusal);
    return result.ok;
  }

  async function persist(draft: Draft): Promise<boolean> {
    const editsAtStart = edits.current;

    if (!(await accepted(props.saveDraft({ ...target, ...draft })))) {
      return false;
    }
    if (edits.current === editsAtStart) {
      setDirty(false);
    }
    return true;
  }

  function markEdited() {
    edits.current += 1;
    setDirty(true);
  }

  function saveCurrentDraft() {
    startTransition(async () => {
      await persist(canvas.current!.draft());
    });
  }

  function publish() {
    startTransition(async () => {
      const errors = canvas.current!.publishErrors();
      setPublishErrors(errors);

      if (errors.length > 0) {
        return;
      }
      if (dirty && !(await persist(canvas.current!.draft()))) {
        return;
      }
      const published = await props.publishDraft(target);
      setRefusal(published.ok ? null : published.refusal);
      if (published.ok || published.refusal === SCHEDULES_NOT_SYNCED) {
        router.refresh();
      }
    });
  }

  function tidy() {
    startTransition(async () => {
      await canvas.current!.tidy();
      await persist(canvas.current!.draft());
    });
  }

  const notice = !props.canManage
    ? 'You can view this workflow but not edit it.'
    : props.viewing !== null
      ? `Version ${versionNumber(props.viewing)} is published and cannot change. Open the draft to edit.`
      : !wide
        ? 'Open on a larger screen to edit'
        : null;

  return (
    <div className={'flex h-[calc(100dvh-4rem)] min-h-0 flex-col'}>
      <header
        className={
          'bg-background flex flex-wrap items-center gap-3 border-b px-4 py-2'
        }
      >
        <Button asChild variant={'ghost'} size={'sm'}>
          <Link href={props.workflowPath}>Back to workflow</Link>
        </Button>
        <h1 className={'truncate text-base font-semibold'}>
          {props.workflowName}
        </h1>
        <details className={'relative'}>
          <summary
            className={
              'border-input bg-background flex h-8 cursor-pointer items-center rounded-md border px-2 text-sm'
            }
          >
            {versionName(props.viewing)}
          </summary>
          <nav
            aria-label={'Versions'}
            className={
              'bg-popover absolute z-10 mt-1 flex min-w-36 flex-col rounded-md border p-1 shadow-md'
            }
          >
            {[null, ...props.published.map((each) => each.id)].map((id) => (
              <Link
                key={id ?? 'draft'}
                href={versionPath(id)}
                aria-current={id === props.viewing ? 'page' : undefined}
                className={
                  'hover:bg-accent aria-[current=page]:font-medium rounded-sm px-2 py-1 text-sm'
                }
              >
                {versionName(id)}
              </Link>
            ))}
          </nav>
        </details>
        {dirty ? (
          <span className={'text-muted-foreground text-sm'}>Unsaved edits</span>
        ) : null}
        {editable ? (
          <div className={'ml-auto flex items-center gap-2'}>
            <Button variant={'outline'} size={'sm'} disabled={pending} onClick={tidy}>
              Tidy
            </Button>
            <Button
              variant={'outline'}
              size={'sm'}
              disabled={pending || !dirty}
              onClick={saveCurrentDraft}
            >
              Save draft
            </Button>
            <Button size={'sm'} disabled={pending} onClick={publish}>
              Publish
            </Button>
          </div>
        ) : null}
      </header>

      {props.schedulesSyncFailed ? (
        <SchedulesSyncBanner
          workflowId={props.workflowId}
          canManage={props.canManage}
          retryScheduleSync={props.retryScheduleSync}
        />
      ) : null}
      {notice ? (
        <p className={'bg-muted text-muted-foreground px-4 py-2 text-sm'}>
          {notice}
        </p>
      ) : null}
      {refusal ? (
        <p role={'alert'} className={'text-destructive px-4 py-2 text-sm'}>
          {refusal}
        </p>
      ) : null}
      {publishErrors.length > 0 ? (
        <ul
          aria-label={'Publish errors'}
          className={'border-destructive/40 flex flex-col gap-1 border-b px-4 py-2 text-sm'}
        >
          {errorsByNode(publishErrors).map(([nodeId, group]) => (
            <li key={nodeId ?? ''}>
              <span className={'font-medium'}>{group.label}</span>
              {group.messages.map((message) => (
                <p key={message} className={'text-destructive'}>
                  {message}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : null}

      <div className={'min-h-0 flex-1'}>
        <WorkflowEditorCanvas
          key={props.viewing ?? 'draft'}
          version={props.version}
          palette={props.palette}
          readOnly={!editable}
          nodeErrors={publishErrors}
          onEdit={markEdited}
          onSave={persist}
          onReady={(handle) => {
            canvas.current = handle;
          }}
        />
      </div>

      <UnsavedChangesGuard
        dirty={dirty}
        title={'Leave without saving?'}
        description={'Your edits to this workflow have not been saved.'}
      />
    </div>
  );
}
