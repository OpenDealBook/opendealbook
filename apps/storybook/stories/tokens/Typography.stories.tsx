import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
  title: 'Tokens/Typography',
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj;

const scale = [
  { px: 32, token: 'text-3xl', usage: 'Page title' },
  { px: 24, token: 'text-2xl', usage: 'Section title' },
  { px: 20, token: 'text-xl', usage: 'Subsection' },
  { px: 16, token: 'text-base', usage: 'Body' },
  { px: 14, token: 'text-sm', usage: 'Default UI' },
  { px: 13, token: 'text-[13px]', usage: 'Dense UI' },
  { px: 12, token: 'text-xs', usage: 'Caption / meta' },
];

const sans = 'ui-sans-serif, system-ui, sans-serif';
const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function Row({
  px,
  token,
  usage,
  family,
  sample,
}: {
  px: number;
  token: string;
  usage: string;
  family: string;
  sample: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gap: 24,
        alignItems: 'baseline',
        padding: '16px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{px}px</div>
        <code
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            fontFamily: mono,
          }}
        >
          {token}
        </code>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            marginTop: 2,
          }}
        >
          {usage}
        </div>
      </div>
      <div style={{ fontSize: px, lineHeight: 1.3, fontFamily: family }}>
        {sample}
      </div>
    </div>
  );
}

export const Sans: Story = {
  render: () => (
    <div
      style={{
        padding: 32,
        background: 'var(--background)',
        color: 'var(--foreground)',
        minHeight: '100vh',
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
        UI Sans
      </h2>
      <p
        style={{
          fontSize: 13,
          color: 'var(--muted-foreground)',
          margin: '0 0 16px',
        }}
      >
        The interface type scale, from 12 to 32 pixels.
      </p>
      {scale.map((s) => (
        <Row
          key={s.px}
          {...s}
          family={sans}
          sample="Close the Series A before quarter end"
        />
      ))}
    </div>
  ),
};

export const Numeric: Story = {
  render: () => (
    <div
      style={{
        padding: 32,
        background: 'var(--background)',
        color: 'var(--foreground)',
        minHeight: '100vh',
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
        Numeric / Mono
      </h2>
      <p
        style={{
          fontSize: 13,
          color: 'var(--muted-foreground)',
          margin: '0 0 16px',
        }}
      >
        The monospace face used for figures, versions, and diffs.
      </p>
      {scale.map((s) => (
        <Row
          key={s.px}
          {...s}
          family={mono}
          sample="$12,450,000.00  v3.2  2026-09-27"
        />
      ))}
    </div>
  ),
};
