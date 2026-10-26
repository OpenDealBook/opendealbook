export type Schema = {
  type?: string;
  const?: string;
  enum?: string[];
  properties?: Record<string, Schema>;
  oneOf?: Schema[];
};

type Config = Record<string, unknown>;

const OPERATORS = ['==', '!=', '<', '<=', '>', '>='] as const;
type Operator = (typeof OPERATORS)[number];

const inputClass = 'rounded border px-2 py-1 text-sm';

function discriminatorOf(variant: Schema): string {
  return Object.entries(variant.properties!).find(
    ([, field]) => field.const !== undefined,
  )![0];
}

function FieldInput(props: {
  name: string;
  field: Schema;
  value: unknown;
  enabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const common = {
    'aria-label': props.name,
    className: inputClass,
    disabled: !props.enabled,
  };

  if (props.field.enum) {
    return (
      <select
        {...common}
        value={String(props.value ?? '')}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.field.enum.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (props.field.type === 'integer' || props.field.type === 'number') {
    return (
      <input
        {...common}
        type={'number'}
        value={String(props.value ?? '')}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    );
  }
  if (props.field.type === 'array') {
    return (
      <input
        {...common}
        value={((props.value ?? []) as string[]).join(', ')}
        onChange={(event) =>
          props.onChange(event.target.value.split(',').map((item) => item.trim()))
        }
      />
    );
  }
  return (
    <input
      {...common}
      value={String(props.value ?? '')}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

export function UnionFields(props: {
  variants: Schema[];
  value: Config;
  enabled: boolean;
  onChange: (next: Config) => void;
}) {
  const key = discriminatorOf(props.variants[0]!);
  const variant = props.variants.find(
    (each) => each.properties![key]!.const === props.value[key],
  );
  const kept = Object.fromEntries(
    Object.entries(props.value).filter(
      ([name]) =>
        !props.variants.some((each) => name in each.properties!),
    ),
  );

  return (
    <div className={'flex flex-col gap-2'}>
      <label className={'flex flex-col gap-1 text-sm'}>
        {key}
        <select
          aria-label={key}
          className={inputClass}
          disabled={!props.enabled}
          value={String(props.value[key] ?? '')}
          onChange={(event) =>
            props.onChange({ ...kept, [key]: event.target.value })
          }
        >
          {variant ? null : <option value={''}>Choose</option>}
          {props.variants.map((each) => (
            <option key={each.properties![key]!.const} value={each.properties![key]!.const}>
              {each.properties![key]!.const}
            </option>
          ))}
        </select>
      </label>
      {Object.entries(variant?.properties ?? {})
        .filter(([name]) => name !== key)
        .map(([name, field]) => (
          <label key={name} className={'flex flex-col gap-1 text-sm'}>
            {name}
            <FieldInput
              name={name}
              field={field}
              value={props.value[name]}
              enabled={props.enabled}
              onChange={(value) => props.onChange({ ...props.value, [name]: value })}
            />
          </label>
        ))}
    </div>
  );
}

type Comparison = Partial<Record<Operator, [unknown, unknown]>>;

function asNumberOrText(text: string): string | number {
  return text.trim() !== '' && !Number.isNaN(Number(text)) ? Number(text) : text;
}

export function RuleFields(props: {
  value: Comparison | Config | undefined;
  fields: { label: string; reference: string }[];
  enabled: boolean;
  onChange: (rule: Comparison) => void;
}) {
  const entries = Object.entries(props.value ?? { '==': [{ var: '' }, ''] });
  const [operator, operands] = entries[0]!;

  if (!OPERATORS.includes(operator as Operator)) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        This rule combines conditions and can only be changed by replacing it.
        <code className={'block break-all'}>{JSON.stringify(props.value)}</code>
      </p>
    );
  }

  const [left, right] = operands as [{ var: string }, unknown];
  const change = (next: Partial<{ operator: string; left: string; right: unknown }>) =>
    props.onChange({
      [next.operator ?? operator]: [
        { var: next.left ?? left.var },
        'right' in next ? next.right : right,
      ],
    });

  return (
    <div className={'flex flex-col gap-2'}>
      <select
        aria-label={'Field'}
        className={inputClass}
        disabled={!props.enabled}
        value={left.var}
        onChange={(event) => change({ left: event.target.value })}
      >
        <option value={''} disabled>
          Choose a field
        </option>
        {props.fields.map((field) => (
          <option key={field.reference} value={field.reference}>
            {field.label}
          </option>
        ))}
      </select>
      <select
        aria-label={'Operator'}
        className={inputClass}
        disabled={!props.enabled}
        value={operator}
        onChange={(event) => change({ operator: event.target.value })}
      >
        {OPERATORS.map((each) => (
          <option key={each} value={each}>
            {each}
          </option>
        ))}
      </select>
      <input
        aria-label={'Value'}
        className={inputClass}
        disabled={!props.enabled}
        value={String(right ?? '')}
        onChange={(event) => change({ right: asNumberOrText(event.target.value) })}
      />
    </div>
  );
}

export function withRootUnions<
  Item extends { schema: { oneOf?: unknown }; uischema: { type: string; elements: object[] } },
>(palette: Item[]): Item[] {
  return palette.map((item) =>
    item.schema.oneOf
      ? {
          ...item,
          uischema: {
            ...item.uischema,
            elements: [
              ...item.uischema.elements,
              { type: 'Control', scope: '#' },
            ],
          },
        }
      : item,
  );
}
