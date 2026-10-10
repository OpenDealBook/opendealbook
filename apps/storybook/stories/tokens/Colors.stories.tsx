import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
  title: 'Tokens/Colors',
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj;

type Swatch = { token: string; description: string };

const surfaces: Swatch[] = [
  { token: 'background', description: 'App canvas' },
  { token: 'foreground', description: 'Default text' },
  { token: 'card', description: 'Card surface' },
  { token: 'card-foreground', description: 'Card text' },
  { token: 'popover', description: 'Popover surface' },
  { token: 'popover-foreground', description: 'Popover text' },
  { token: 'muted', description: 'Muted surface' },
  { token: 'muted-foreground', description: 'Muted text' },
  { token: 'border', description: 'Hairline borders' },
  { token: 'input', description: 'Field borders' },
  { token: 'ring', description: 'Focus ring' },
];

const roles: Swatch[] = [
  { token: 'primary', description: 'Primary action' },
  { token: 'primary-foreground', description: 'On primary' },
  { token: 'secondary', description: 'Secondary action' },
  { token: 'secondary-foreground', description: 'On secondary' },
  { token: 'accent', description: 'Accent surface' },
  { token: 'accent-foreground', description: 'On accent' },
  { token: 'success', description: 'Success / positive (green)' },
  { token: 'warning', description: 'Warning / attention (amber)' },
  { token: 'brass', description: 'Brass / in-progress (gold)' },
  { token: 'brass-foreground', description: 'On brass' },
  { token: 'destructive', description: 'Risk / destructive (red)' },
  { token: 'destructive-foreground', description: 'On destructive' },
];

const charts: Swatch[] = [
  { token: 'chart-1', description: 'Series 1' },
  { token: 'chart-2', description: 'Series 2' },
  { token: 'chart-3', description: 'Series 3' },
  { token: 'chart-4', description: 'Series 4' },
  { token: 'chart-5', description: 'Series 5' },
];

function Grid({
  title,
  note,
  items,
}: {
  title: string;
  note?: string;
  items: Swatch[];
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
        {title}
      </h2>
      {note ? (
        <p
          style={{
            fontSize: 13,
            color: 'var(--muted-foreground)',
            margin: '0 0 16px',
          }}
        >
          {note}
        </p>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
        }}
      >
        {items.map((swatch) => (
          <div
            key={swatch.token}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              background: 'var(--card)',
            }}
          >
            <div style={{ height: 72, background: `var(--${swatch.token})` }} />
            <div style={{ padding: '10px 12px' }}>
              <code
                style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace' }}
              >
                --{swatch.token}
              </code>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  marginTop: 2,
                }}
              >
                {swatch.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const Palette: Story = {
  render: () => (
    <div
      style={{
        padding: 32,
        minHeight: '100vh',
        background: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      <Grid title="Surfaces & Text" items={surfaces} />
      <Grid title="Roles & Status" items={roles} />
      <Grid
        title="Chart palette"
        note="globals.css ships the chart ramp for data visualization; success/warning/brass/destructive above carry the semantic status roles."
        items={charts}
      />
    </div>
  ),
};
