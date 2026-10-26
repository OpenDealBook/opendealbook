import { z } from 'zod';

import { NODE_CONFIG_SCHEMAS, NODE_TYPES, type NodeTypeName } from '../graph';
import { DECISION_NODE_TYPES } from '../nodeKinds';
import { stepRegistry } from '../registry';
import { NODE_TYPE_DISPLAY, type NodeIcon } from './nodeTypes';

type JsonSchema = z.core.JSONSchema.JSONSchema;

type OutputType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface OutputSchema {
  type: 'default';
  properties: Record<string, { type: OutputType; label: string }>;
}

interface Control {
  type: 'Control';
  scope: string;
  options?: { expression: true };
}

export interface PaletteItem {
  type: NodeTypeName;
  label: string;
  description: string;
  icon: NodeIcon;
  defaultPropertiesData: Record<string, unknown>;
  schema: JsonSchema;
  uischema: { type: 'VerticalLayout'; elements: Control[] };
  outputSchema?: OutputSchema;
}

const EVENT_TRIGGER_OUTPUT = z.object({
  eventType: z.string(),
  dealId: z.string(),
  accountId: z.string(),
  globalSeq: z.number(),
});

const DECIDED = z.object({ approved: z.boolean() });

const OUTPUT_SCHEMAS: Partial<Record<NodeTypeName, z.ZodType>> = {
  ...Object.fromEntries(
    Object.values(stepRegistry).map((step) => [
      step.type,
      DECISION_NODE_TYPES.includes(step.type) ? z.intersection(step.outputSchema, DECIDED) : step.outputSchema,
    ]),
  ),
  event_trigger: EVENT_TRIGGER_OUTPUT,
  loop: z.object({ item: z.json(), index: z.number() }),
};

const OUTPUT_TYPES: Record<string, OutputType> = {
  string: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  array: 'array',
};

const EDITOR_FIELDS = { label: { type: 'string' }, description: { type: 'string' } } as const;

function propertiesOf(schema: JsonSchema): Record<string, JsonSchema> {
  return Object.assign({}, schema.properties, ...[...(schema.anyOf ?? []), ...(schema.allOf ?? [])].map(propertiesOf));
}

function outputSchema(schema: z.ZodType): OutputSchema {
  return {
    type: 'default',
    properties: Object.fromEntries(
      Object.entries(propertiesOf(z.toJSONSchema(schema))).map(([name, field]) => [
        name,
        { type: OUTPUT_TYPES[String(field.type)] ?? 'object', label: name },
      ]),
    ),
  };
}

function acceptsReference(field: JsonSchema): boolean {
  return field.type === 'string' && field.enum === undefined && field.pattern === undefined;
}

function paletteItem(type: NodeTypeName): PaletteItem {
  const config = z.toJSONSchema(NODE_CONFIG_SCHEMAS[type], { target: 'draft-7', io: 'input' });
  const configFields = config.properties ?? {};
  const fields = { ...EDITOR_FIELDS, ...configFields };
  const output = OUTPUT_SCHEMAS[type];
  return {
    type,
    ...NODE_TYPE_DISPLAY[type],
    defaultPropertiesData: Object.fromEntries(
      Object.entries(configFields).flatMap(([name, field]) =>
        typeof field === 'object' && field.default !== undefined ? [[name, field.default]] : [],
      ),
    ),
    schema: { ...config, type: 'object', properties: fields },
    uischema: {
      type: 'VerticalLayout',
      elements: Object.entries(fields).map(([name, field]) => ({
        type: 'Control',
        scope: `#/properties/${name}`,
        ...(name in configFields && acceptsReference(field) && { options: { expression: true } }),
      })),
    },
    ...(output && { outputSchema: outputSchema(output) }),
  };
}

export function paletteNodeTypes(): PaletteItem[] {
  return NODE_TYPES.map(paletteItem);
}
