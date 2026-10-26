// @vitest-environment jsdom
import { type ComponentType, act } from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  type EditorLayout,
  type PaletteItem,
  toEditorData,
} from '@odb/workflows/builder/editor';

import { clearScreen, settle, show } from './lender-test-kit';
import {
  type Draft,
  type EditorCanvasHandle,
  type NodeError,
  WorkflowEditorCanvas,
} from './workflow-editor-canvas';

type Rendered = {
  initialNodes: { id: string; position: { x: number; y: number }; data: { type: string; properties: { label?: string } } }[];
  nodeTemplates: Record<string, ComponentType<Record<string, unknown>>>;
  jsonForm: { renderers: { renderer: ComponentType<Record<string, unknown>> }[] };
};

const vendor = vi.hoisted(() => ({
  root: null as Rendered | null,
  store: null as unknown,
  selection: null as { node: { id: string } | null; edge: { id: string } | null } | null,
  panel: null as Record<string, unknown> | null,
  handle: null as EditorCanvasHandle | null,
  storedNodes: null as { id: string; position: { x: number; y: number } }[] | null,
}));

vi.mock('@workflowbuilder/sdk/style.css', () => ({}));

vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  Handle: (props: { type: string; id?: string }) => (
    <span data-handle={`${props.type}:${props.id ?? ''}`} />
  ),
}));

vi.mock('@workflowbuilder/sdk', () => {
  const tester = () => () => 0;

  return {
    rankWith: tester,
    optionIs: tester,
    scopeEndsWith: tester,
    schemaMatches: tester,
    or: tester,
    and: tester,
    isControl: () => false,
    withJsonFormsControlProps: (control: unknown) => control,
    getStoreDataForIntegration: () => vendor.store,
    setStoreNodes: (nodes: typeof vendor.storedNodes) => {
      vendor.storedNodes = nodes;
    },
    useChangesTrackerStore: { subscribe: () => () => {} },
    useSingleSelectedElement: () => vendor.selection,
    useWorkflowBuilderActions: () => ({ setReadOnly: () => {} }),
    WorkflowBuilder: {
      Root: (props: Rendered & { children: React.ReactNode }) => {
        vendor.root = props;

        return (
          <>
            {props.initialNodes.map((node) => {
              const Template = props.nodeTemplates[node.data.type]!;

              return (
                <div key={node.id} data-node={node.id}>
                  <Template
                    id={node.id}
                    label={node.data.properties.label ?? ''}
                    description={''}
                    data={node.data}
                    layoutDirection={'RIGHT'}
                  />
                </div>
              );
            })}
            {props.children}
          </>
        );
      },
      Palette: () => null,
      Canvas: () => null,
      PropertiesPanel: () => {
        const Expression = vendor.root!.jsonForm.renderers[0]!.renderer;

        return (
          <div>
            Properties panel
            {vendor.panel ? <Expression {...vendor.panel} /> : null}
          </div>
        );
      },
    },
  };
});

const palette = [
  { type: 'manual_trigger', properties: {} },
  { type: 'ask_ai', properties: { answer: { type: 'string', label: 'answer' } } },
  ...['branch', 'loop', 'approval', 'decision_model', 'notify_team'].map((type) => ({
    type,
    properties: {},
  })),
].map((item) => ({
  type: item.type,
  schema: { type: 'object', properties: {} },
  uischema: { type: 'VerticalLayout', elements: [] },
  outputSchema: { type: 'default', properties: item.properties },
})) as unknown as PaletteItem[];

const graph: Draft['graph'] = {
  nodes: [
    { id: 'start', type: 'manual_trigger', config: {} },
    { id: 'ask', type: 'ask_ai', label: 'Score the deal', config: { prompt: 'Score it' } },
    { id: 'check', type: 'branch', config: { rule: { '==': [1, 1] } } },
    { id: 'each', type: 'loop', config: { items: [] } },
    { id: 'ok', type: 'approval', config: { prompt: 'Go?' } },
    { id: 'firm', type: 'decision_model', config: { firmId: 'f1' } },
    { id: 'tell', type: 'notify_team', config: { message: 'Hi' } },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'ask' },
    { id: 'e2', sourceNodeId: 'ask', targetNodeId: 'tell' },
  ],
};

const placed: EditorLayout = {
  direction: 'RIGHT',
  positions: Object.fromEntries(
    graph.nodes.map((node, index) => [node.id, { x: index * 300, y: 0 }]),
  ),
};

async function open(
  layout: EditorLayout = placed,
  nodeErrors: NodeError[] = [],
  shown: Draft['graph'] = graph,
) {
  vendor.store = toEditorData(shown, layout);
  show(
    <WorkflowEditorCanvas
      version={{ graph: shown, layout }}
      palette={palette}
      readOnly={false}
      nodeErrors={nodeErrors}
      onEdit={() => {}}
      onSave={async () => true}
      onReady={(handle) => {
        vendor.handle = handle;
      }}
    />,
  );
  await settle();
  await vi.waitFor(() =>
    expect(vendor.root ?? document.querySelector('[role="alert"]')).toBeTruthy(),
  );
}

function handlesOf(nodeId: string): string[] {
  return [
    ...document.querySelectorAll(`[data-node="${nodeId}"] [data-handle]`),
  ].map((handle) => handle.getAttribute('data-handle')!);
}

function textOf(nodeId: string): string {
  return document.querySelector(`[data-node="${nodeId}"]`)!.textContent!;
}

beforeEach(() => {
  vendor.root = null;
  vendor.selection = null;
  vendor.panel = null;
  vendor.handle = null;
  vendor.storedNodes = null;
});
afterEach(clearScreen);

it('gives each step its named outlets and triggers no inlet', async () => {
  await open();

  expect(handlesOf('start')).toEqual(['source:']);
  expect(handlesOf('tell')).toEqual(['target:', 'source:']);
  expect(handlesOf('check')).toEqual(['target:', 'source:true', 'source:false']);
  expect(handlesOf('each')).toEqual(['target:', 'source:each', 'source:done']);
  expect(handlesOf('ok')).toEqual(['target:', 'source:approved', 'source:rejected']);
  expect(handlesOf('firm')).toEqual(['target:', 'source:approved', 'source:rejected']);
});

it('shows a label when set and the friendly type name otherwise', async () => {
  await open();

  expect(textOf('ask')).toContain('Score the deal');
  expect(textOf('check')).toContain('Branch');
});

it('shows publish errors on the node they belong to', async () => {
  await open(placed, [
    { nodeId: 'tell', label: 'Notify team', message: 'Add a message' },
  ]);

  expect(textOf('tell')).toContain('Add a message');
  expect(textOf('ask')).not.toContain('Add a message');
});

it('keeps saved positions when every node has one', async () => {
  await open();

  expect(vendor.root!.initialNodes.map((node) => node.position)).toEqual(
    graph.nodes.map((node) => placed.positions[node.id]),
  );
});

it('places only the nodes without a saved position on load', async () => {
  await open({ direction: 'RIGHT', positions: { start: { x: 5000, y: 7000 } } });

  const position = (id: string) =>
    vendor.root!.initialNodes.find((node) => node.id === id)!.position;

  expect(position('start')).toEqual({ x: 5000, y: 7000 });
  expect(position('tell').x).toBeGreaterThan(position('ask').x);
});

it('explains when the layout cannot be worked out instead of a blank canvas', async () => {
  await open({ direction: 'RIGHT', positions: {} }, [], {
    nodes: [{ id: 'start', type: 'manual_trigger', config: {} }],
    edges: [{ id: 'e1', sourceNodeId: 'start', targetNodeId: 'missing' }],
  });

  expect(document.body.textContent).toContain(
    'This workflow could not be laid out',
  );
});

it('tidies nodes the canvas has not measured yet', async () => {
  await open();

  await act(() => vendor.handle!.tidy());

  expect(vendor.storedNodes!.map((node) => node.id)).toEqual(
    graph.nodes.map((node) => node.id),
  );
  expect(vendor.storedNodes!.every((node) => Number.isFinite(node.position.x))).toBe(true);
});

it('shows no properties for a selected arrow, so arrows get no label', async () => {
  vendor.selection = { node: null, edge: { id: 'e1' } };
  await open();

  expect(document.body.textContent).not.toContain('Properties panel');
});

it('inserts the picked earlier output as a step id expression', async () => {
  const changes: [string, string][] = [];
  vendor.selection = { node: { id: 'tell' }, edge: null };
  vendor.panel = {
    label: 'message',
    path: 'message',
    data: 'Result: ',
    enabled: true,
    handleChange: (path: string, value: string) => changes.push([path, value]),
  };
  await open();

  const picker = document.querySelector<HTMLSelectElement>(
    'select[aria-label="Insert a field"]',
  )!;
  expect([...picker.options].map((option) => option.text)).toEqual([
    'Insert a field',
    'Score the deal: answer',
  ]);

  act(() => {
    picker.value = '{{steps.ask.answer}}';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(changes).toEqual([['message', 'Result: {{steps.ask.answer}}']]);
});
