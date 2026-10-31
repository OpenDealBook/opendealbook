// @vitest-environment jsdom
import { type ComponentProps, act } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  alerts,
  buttonNames,
  clearScreen,
  fakeActions,
  fakeServer,
  linkTo,
  pageText,
  press,
  settle,
  show,
} from './lender-test-kit';
import {
  SCHEDULES_NOT_SYNCED,
  SCHEDULES_SYNC_FAILED,
} from '../[account]/workflows/workflow-refusals';
import { WorkflowEditor } from './workflow-editor';
import type { EditorCanvasProps, NodeError } from './workflow-editor-canvas';

vi.mock(
  'next/navigation',
  async () => (await import('./lender-test-kit')).navigation,
);

const canvas = vi.hoisted(() => ({
  props: null as EditorCanvasProps | null,
  draft: { graph: { nodes: [], edges: [] }, layout: {} } as object,
  publishErrors: [] as NodeError[],
  tidied: 0,
}));

vi.mock('./workflow-editor-canvas', () => ({
  WorkflowEditorCanvas: (props: EditorCanvasProps) => {
    canvas.props = props;
    props.onReady({
      draft: () => canvas.draft as never,
      publishErrors: () => canvas.publishErrors,
      tidy: async () => {
        canvas.tidied += 1;
        props.onEdit();
      },
    });

    return (
      <div>
        {props.readOnly ? 'Canvas is read only' : 'Canvas is editable'}
        {props.nodeErrors.map((error) => (
          <span key={error.message}>{`On ${error.nodeId}: ${error.message}`}</span>
        ))}
        <button onClick={props.onEdit}>Edit a node</button>
      </div>
    );
  },
}));

type Props = ComponentProps<typeof WorkflowEditor>;

const WORKFLOW = 'w0000000-0000-4000-8000-000000000001';
const PATH = `/home/team-one/workflows/${WORKFLOW}`;

const props: Props = {
  workflowId: WORKFLOW,
  workflowName: 'New deal alert',
  workflowPath: PATH,
  published: [{ id: 'v2' }, { id: 'v1' }],
  viewing: null,
  version: { graph: { nodes: [], edges: [] }, layout: { direction: 'RIGHT', positions: {} } },
  palette: [],
  canManage: true,
  schedulesSyncFailed: false,
  ...(fakeActions(
    'saveDraft',
    'publishDraft',
    'retryScheduleSync',
  ) as Pick<Props, 'saveDraft' | 'publishDraft' | 'retryScheduleSync'>),
};

function wide(isWide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isWide,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

async function open(overrides: Partial<Props> = {}) {
  show(<WorkflowEditor {...props} {...overrides} />);
  await settle();
}

beforeEach(() => {
  fakeServer.reset();
  wide(true);
  canvas.props = null;
  canvas.draft = { graph: { nodes: [], edges: [] }, layout: {} };
  canvas.publishErrors = [];
  canvas.tidied = 0;
});
afterEach(clearScreen);

it('mounts the editable canvas with the draft toolbar for a manager', async () => {
  await open();

  expect(pageText()).toContain('Canvas is editable');
  expect(buttonNames()).toEqual(
    expect.arrayContaining(['Save draft', 'Publish', 'Tidy']),
  );
  expect(linkTo('Back to workflow')).toBe(PATH);
});

it('keeps Save draft disabled until the draft has unsaved edits', async () => {
  await open();
  expect(buttonOf('Save draft').disabled).toBe(true);

  await press('Edit a node');

  expect(buttonOf('Save draft').disabled).toBe(false);
});

it('saves the canvas draft and is clean again', async () => {
  canvas.draft = { graph: { nodes: [{ id: 'n1' }], edges: [] }, layout: { direction: 'RIGHT' } };
  await open();
  await press('Edit a node');

  await press('Save draft');

  expect(fakeServer.inputsTo('saveDraft')).toEqual([
    {
      workflowId: WORKFLOW,
      graph: { nodes: [{ id: 'n1' }], edges: [] },
      layout: { direction: 'RIGHT' },
    },
  ]);
  expect(buttonOf('Save draft').disabled).toBe(true);
});

it('shows a save refusal and stays unsaved', async () => {
  fakeServer.refusalFor.saveDraft = 'The draft changed elsewhere';
  await open();
  await press('Edit a node');

  await press('Save draft');

  expect(alerts()).toEqual(['The draft changed elsewhere']);
  expect(buttonOf('Save draft').disabled).toBe(false);
});

it('tidies the canvas and saves the new layout', async () => {
  canvas.draft = { graph: { nodes: [], edges: [] }, layout: { direction: 'RIGHT', positions: { n1: { x: 0, y: 0 } } } };
  await open();

  await press('Tidy');

  expect(canvas.tidied).toBe(1);
  expect(fakeServer.inputsTo('saveDraft')).toEqual([
    {
      workflowId: WORKFLOW,
      graph: { nodes: [], edges: [] },
      layout: { direction: 'RIGHT', positions: { n1: { x: 0, y: 0 } } },
    },
  ]);
  expect(buttonOf('Save draft').disabled).toBe(true);
});

it('lists publish errors per node and does not publish', async () => {
  canvas.publishErrors = [
    { nodeId: 'send', label: 'Send email', message: 'The to setting is not valid' },
    { nodeId: 'send', label: 'Send email', message: 'Two arrows lead into this step' },
    { nodeId: null, label: null, message: 'Add a trigger' },
  ];
  await open();

  await press('Publish');

  expect(fakeServer.inputsTo('publishDraft')).toEqual([]);
  expect(itemsOf('[aria-label="Publish errors"] li')).toEqual([
    'Workflow Add a trigger',
    'Send email The to setting is not valid Two arrows lead into this step',
  ]);
  expect(pageText()).toContain('On send: The to setting is not valid');
});

it('saves unsaved edits, then publishes and refreshes', async () => {
  await open();
  await press('Edit a node');

  await press('Publish');

  expect(fakeServer.calls.map((call) => call.action)).toEqual([
    'saveDraft',
    'publishDraft',
  ]);
  expect(fakeServer.inputsTo('publishDraft')).toEqual([
    { workflowId: WORKFLOW },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it('shows the AI provider refusal from publish', async () => {
  fakeServer.refusalFor.publishDraft = 'Connect an AI provider first';
  await open();

  await press('Publish');

  expect(alerts()).toEqual(['Connect an AI provider first']);
  expect(fakeServer.refreshes).toBe(0);
});

it('refreshes after a publish whose schedules failed to update, so the lasting notice shows', async () => {
  fakeServer.refusalFor.publishDraft = SCHEDULES_NOT_SYNCED;
  await open();

  await press('Publish');

  expect(alerts()).toEqual([SCHEDULES_NOT_SYNCED]);
  expect(fakeServer.refreshes).toBe(1);
});

it('keeps saying schedules failed to update and lets a manager retry', async () => {
  await open({ schedulesSyncFailed: true });
  expect(pageText()).toContain(SCHEDULES_SYNC_FAILED);

  await press('Retry schedules');

  expect(fakeServer.inputsTo('retryScheduleSync')).toEqual([
    { workflowId: WORKFLOW },
  ]);
  expect(fakeServer.refreshes).toBe(1);
});

it('says schedules failed to update without Retry to someone who cannot edit workflows', async () => {
  await open({ schedulesSyncFailed: true, canManage: false });

  expect(pageText()).toContain(SCHEDULES_SYNC_FAILED);
  expect(buttonNames()).not.toContain('Retry schedules');
});

it('says nothing about schedules when the last update reached them', async () => {
  await open();

  expect(pageText()).not.toContain(SCHEDULES_SYNC_FAILED);
  expect(buttonNames()).not.toContain('Retry schedules');
});

it('links the draft and every published version, marking the one shown', async () => {
  await open({ viewing: 'v1' });

  expect(versionLinks()).toEqual([
    { text: 'Draft', href: `${PATH}/edit`, current: false },
    { text: 'Version 2', href: `${PATH}/edit?version=v2`, current: false },
    { text: 'Version 1', href: `${PATH}/edit?version=v1`, current: true },
  ]);
});

it('asks before switching version with unsaved edits', async () => {
  await open();
  await press('Edit a node');

  act(() =>
    document.querySelector<HTMLAnchorElement>(`a[href="${PATH}/edit?version=v1"]`)!.click(),
  );

  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    'Leave without saving?',
  );
});

it('stays unsaved when an edit lands while the save is in flight', async () => {
  await open({
    saveDraft: async () => {
      canvas.props!.onEdit();
      return { ok: true, value: { savedAt: '2026-10-26T12:00:00Z' } };
    },
  });
  await press('Edit a node');

  await press('Save draft');

  expect(buttonOf('Save draft').disabled).toBe(false);
});

it('shows a published version read-only with no draft actions', async () => {
  await open({ viewing: 'v1' });

  expect(pageText()).toContain('Canvas is read only');
  expect(pageText()).toContain('Version 1 is published and cannot change');
  expect(buttonNames()).not.toEqual(
    expect.arrayContaining(['Save draft']),
  );
  expect(buttonNames().filter((name) => ['Publish', 'Tidy'].includes(name))).toEqual([]);
});

it('is read-only without workflows.manage', async () => {
  await open({ canManage: false });

  expect(pageText()).toContain('Canvas is read only');
  expect(pageText()).toContain('You can view this workflow but not edit it');
  expect(
    buttonNames().filter((name) => ['Save draft', 'Publish', 'Tidy'].includes(name)),
  ).toEqual([]);
});

it('is view only under the tablet breakpoint', async () => {
  wide(false);
  await open();

  expect(pageText()).toContain('Open on a larger screen to edit');
  expect(pageText()).toContain('Canvas is read only');
  expect(
    buttonNames().filter((name) => ['Save draft', 'Publish', 'Tidy'].includes(name)),
  ).toEqual([]);
});

it('shows the name as a heading with no rename field', async () => {
  await open();

  expect(document.querySelector('h1')?.textContent).toBe('New deal alert');
  expect(document.querySelector('input[aria-label="Workflow name"]')).toBeNull();
});

it('asks before leaving with unsaved edits', async () => {
  await open();
  await press('Edit a node');

  act(() => document.querySelector<HTMLAnchorElement>(`a[href="${PATH}"]`)!.click());

  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    'Leave without saving?',
  );
});

function buttonOf(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (each) => (each.getAttribute('aria-label') ?? each.textContent?.trim()) === name,
  );

  if (!found) {
    throw new Error(`No button named "${name}"`);
  }

  return found;
}

function versionLinks() {
  return [
    ...document.querySelectorAll<HTMLAnchorElement>('[aria-label="Versions"] a'),
  ].map((link) => ({
    text: link.textContent,
    href: link.getAttribute('href'),
    current: link.getAttribute('aria-current') === 'page',
  }));
}

function itemsOf(selector: string): string[] {
  return [...document.querySelectorAll(selector)].map((element) =>
    [...element.children]
      .map((child) => (child.textContent ?? '').trim())
      .join(' '),
  );
}
