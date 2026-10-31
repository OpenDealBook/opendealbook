'use client';

import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  type ControlProps,
  type PaletteItemOrGroup,
  type WorkflowBuilderNodeTemplates,
  type WorkflowNodeTemplateProps,
  WorkflowBuilder,
  getStoreDataForIntegration,
  optionIs,
  or,
  rankWith,
  schemaMatches,
  scopeEndsWith,
  setStoreNodes,
  useChangesTrackerStore,
  useSingleSelectedElement,
  useWorkflowBuilderActions,
  withJsonFormsControlProps,
} from '@workflowbuilder/sdk';
import '@workflowbuilder/sdk/style.css';
import { Handle, Position } from '@xyflow/react';

import type { WorkflowGraph } from '@odb/workflows/builder/client';
import {
  type EditorData,
  type EditorLayout,
  NODE_HANDLES,
  NODE_TYPE_DISPLAY,
  type PaletteItem,
  TRIGGER_TYPES,
  fromEditorData,
  labeledPublishProblems,
  toEditorData,
  upstreamFields,
} from '@odb/workflows/builder/editor';

import {
  RuleFields,
  type Schema,
  UnionFields,
  withRootUnions,
} from './workflow-editor-forms';
import { tidyPositions } from './workflow-editor-tidy';

export interface Draft {
  graph: WorkflowGraph;
  layout: EditorLayout;
}

export type NodeError = ReturnType<typeof labeledPublishProblems>[number];

export interface EditorCanvasHandle {
  draft: () => Draft;
  publishErrors: () => NodeError[];
  tidy: () => Promise<void>;
}

export interface EditorCanvasProps {
  version: Draft;
  palette: PaletteItem[];
  readOnly: boolean;
  nodeErrors: NodeError[];
  onEdit: () => void;
  onSave: (draft: Draft) => Promise<boolean>;
  onReady: (handle: EditorCanvasHandle) => void;
}

type NodeType = keyof typeof NODE_TYPE_DISPLAY;

const NODE_SIZE = { width: 240, height: 72 };
const BLOCK_GAP = 60;
const LAYOUT_FAILED = 'This workflow could not be laid out. Reload the page to try again.';

const NodeErrors = createContext<NodeError[]>([]);
const Palette = createContext<PaletteItem[]>([]);

function currentDraft(): Draft {
  return fromEditorData(getStoreDataForIntegration() as EditorData);
}

function publishErrors(): NodeError[] {
  return labeledPublishProblems(currentDraft().graph);
}

function useUpstream() {
  const palette = use(Palette);
  const nodeId = useSingleSelectedElement()?.node?.id;

  return nodeId ? upstreamFields(currentDraft().graph, nodeId, palette) : [];
}

function ExpressionControl(props: ControlProps) {
  const value = typeof props.data === 'string' ? props.data : '';
  const fields = useUpstream().flatMap((node) =>
    node.fields.map((field) => ({
      label: `${node.label}: ${field.name}`,
      reference: field.expression,
    })),
  );

  return (
    <div className={'flex flex-col gap-1'}>
      <label className={'flex flex-col gap-1 text-sm'}>
        {props.label}
        <input
          className={'rounded border px-2 py-1'}
          value={value}
          disabled={!props.enabled}
          onChange={(event) => props.handleChange(props.path, event.target.value)}
        />
      </label>
      {props.enabled ? (
        <select
          aria-label={'Insert a field'}
          className={'rounded border px-2 py-1 text-sm'}
          value={''}
          onChange={(event) =>
            props.handleChange(props.path, value + event.target.value)
          }
        >
          <option value={''} disabled>
            Insert a field
          </option>
          {fields.map((field) => (
            <option key={field.reference} value={field.reference}>
              {field.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function RuleControl(props: ControlProps) {
  const fields = useUpstream().flatMap((node) =>
    node.fields.map((field) => ({
      label: `${node.label}: ${field.name}`,
      reference: `steps.${node.nodeId}.${field.name}`,
    })),
  );

  return (
    <div className={'flex flex-col gap-1 text-sm'}>
      {props.label}
      <RuleFields
        value={props.data}
        fields={fields}
        enabled={props.enabled}
        onChange={(rule) => props.handleChange(props.path, rule)}
      />
    </div>
  );
}

function UnionControl(props: ControlProps) {
  const root = props.path === '';

  return (
    <div className={'flex flex-col gap-1 text-sm'}>
      {root ? null : props.label}
      <UnionFields
        variants={props.schema.oneOf as Schema[]}
        value={props.data ?? {}}
        enabled={props.enabled}
        onChange={(next) => props.handleChange(props.path, next)}
      />
    </div>
  );
}

const jsonForm = {
  renderers: [
    {
      tester: rankWith(10, or(optionIs('expression', true), scopeEndsWith('items'))),
      renderer: withJsonFormsControlProps(ExpressionControl),
    },
    {
      tester: rankWith(10, or(scopeEndsWith('rule'), scopeEndsWith('filter'))),
      renderer: withJsonFormsControlProps(RuleControl),
    },
    {
      tester: rankWith(10, schemaMatches((schema) => Array.isArray(schema.oneOf))),
      renderer: withJsonFormsControlProps(UnionControl),
    },
  ],
};

function NodeErrorList(props: { nodeId: string }) {
  const errors = use(NodeErrors).filter((error) => error.nodeId === props.nodeId);

  return errors.length > 0 ? (
    <ul role={'alert'} className={'pt-1 text-xs text-red-600'}>
      {errors.map((error) => (
        <li key={error.message}>{error.message}</li>
      ))}
    </ul>
  ) : null;
}

function StepNode(props: WorkflowNodeTemplateProps) {
  const type = props.data!.type as NodeType;
  const down = props.layoutDirection === 'DOWN';
  const handles = NODE_HANDLES[type];

  return (
    <div
      style={{ width: NODE_SIZE.width }}
      className={`rounded-md border bg-white px-3 py-2 shadow-sm ${props.selected ? 'border-blue-500' : ''}`}
    >
      {(TRIGGER_TYPES as readonly string[]).includes(type) ? null : (
        <Handle type={'target'} position={down ? Position.Top : Position.Left} />
      )}
      <p className={'text-sm font-medium'}>
        {props.label || NODE_TYPE_DISPLAY[type].label}
      </p>
      <p className={'text-xs text-gray-500'}>
        {props.description || NODE_TYPE_DISPLAY[type].description}
      </p>
      <NodeErrorList nodeId={props.id} />
      {handles.length === 0 ? (
        <Handle type={'source'} position={down ? Position.Bottom : Position.Right} />
      ) : (
        handles.map((handle, index) => (
          <Handle
            key={handle}
            id={handle}
            type={'source'}
            position={down ? Position.Bottom : Position.Right}
            style={{ [down ? 'left' : 'top']: `${((index + 1) * 100) / (handles.length + 1)}%` }}
          >
            <span className={'pointer-events-none absolute ml-3 text-[10px] text-gray-500'}>
              {handle}
            </span>
          </Handle>
        ))
      )}
    </div>
  );
}

function HostConnection(props: EditorCanvasProps) {
  const { setReadOnly } = useWorkflowBuilderActions();
  const latest = useRef(props);

  useLayoutEffect(() => {
    latest.current = props;
  });

  useEffect(() => setReadOnly(props.readOnly), [setReadOnly, props.readOnly]);

  useEffect(
    () => useChangesTrackerStore.subscribe(() => latest.current.onEdit()),
    [],
  );

  useEffect(() => {
    latest.current.onReady({
      draft: currentDraft,
      publishErrors,
      tidy: async () => {
        const data = getStoreDataForIntegration();
        const positions = await tidyPositions(
          data.nodes.map((node) => ({
            id: node.id,
            width: node.measured?.width ?? NODE_SIZE.width,
            height: node.measured?.height ?? NODE_SIZE.height,
          })),
          data.edges,
          data.layoutDirection,
        );
        setStoreNodes(
          data.nodes.map((node) => ({ ...node, position: positions.get(node.id)! })),
        );
        latest.current.onEdit();
      },
    });
  }, []);

  return null;
}

async function positioned(version: Draft) {
  const data = toEditorData(version.graph, version.layout);
  const saved = data.nodes.flatMap((node) => (node.position ? [node.position] : []));
  const placed = saved.length === data.nodes.length
    ? new Map()
    : await placeBesideSaved(data, saved);

  return {
    ...data,
    nodes: data.nodes.map((node) => ({
      ...node,
      position: node.position ?? placed.get(node.id)!,
    })),
  };
}

async function placeBesideSaved(
  data: ReturnType<typeof toEditorData>,
  saved: { x: number; y: number }[],
) {
  const tidied = await tidyPositions(
    data.nodes.map((node) => ({ id: node.id, ...NODE_SIZE })),
    data.edges,
    data.layoutDirection,
  );
  const fresh = data.nodes.filter((node) => !node.position).map((node) => tidied.get(node.id)!);
  const shift = saved.length === 0
    ? 0
    : Math.max(...saved.map((position) => position.x + NODE_SIZE.width)) +
      BLOCK_GAP -
      Math.min(...fresh.map((position) => position.x));

  return new Map(
    [...tidied].map(([id, { x, y }]) => [id, { x: x + shift, y }]),
  );
}

function NodePropertiesPanel() {
  return useSingleSelectedElement()?.edge ? null : <WorkflowBuilder.PropertiesPanel />;
}

export function WorkflowEditorCanvas(props: EditorCanvasProps) {
  const [initial, setInitial] = useState<
    Awaited<ReturnType<typeof positioned>> | 'failed' | null
  >(null);
  const [nodeTypes] = useState(
    () => withRootUnions(props.palette) as unknown as PaletteItemOrGroup[],
  );
  const [nodeTemplates] = useState<WorkflowBuilderNodeTemplates>(() =>
    Object.fromEntries(props.palette.map((item) => [item.type, StepNode])),
  );

  useEffect(() => {
    positioned(props.version).then(setInitial, () => setInitial('failed'));
  }, [props.version]);

  if (initial === 'failed') {
    return (
      <p role={'alert'} className={'text-destructive p-4 text-sm'}>
        {LAYOUT_FAILED}
      </p>
    );
  }
  if (!initial) {
    return null;
  }

  return (
    <Palette value={props.palette}>
      <NodeErrors value={props.nodeErrors}>
        <WorkflowBuilder.Root
          nodeTypes={nodeTypes}
          nodeTemplates={nodeTemplates}
          jsonForm={jsonForm}
          initialNodes={initial.nodes}
          initialEdges={initial.edges}
          layoutDirection={initial.layoutDirection}
          integration={{
            strategy: 'props',
            onDataSave: async (data) =>
              (await props.onSave(fromEditorData(data as EditorData)))
                ? 'success'
                : 'error',
          }}
        >
          <div className={'grid h-full grid-cols-[16rem_minmax(0,1fr)_20rem]'}>
            <aside className={'min-h-0 overflow-y-auto border-r'}>
              <WorkflowBuilder.Palette />
            </aside>
            <main className={'relative min-h-0'}>
              <WorkflowBuilder.Canvas />
            </main>
            <aside className={'min-h-0 overflow-y-auto border-l'}>
              <NodePropertiesPanel />
            </aside>
          </div>
          <HostConnection {...props} />
        </WorkflowBuilder.Root>
      </NodeErrors>
    </Palette>
  );
}
