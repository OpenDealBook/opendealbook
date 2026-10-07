import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
  title: 'Tokens/Design System',
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj;

type Swatch = { token: string; usage: string };

const colorGroups: Array<{ title: string; items: Swatch[] }> = [
  {
    title: 'Surfaces & text',
    items: [
      { token: 'background', usage: 'Page background' },
      { token: 'foreground', usage: 'Default text' },
      { token: 'card', usage: 'Card surface' },
      { token: 'card-foreground', usage: 'Card text' },
      { token: 'popover', usage: 'Popover surface' },
      { token: 'popover-foreground', usage: 'Popover text' },
      { token: 'muted', usage: 'Muted surface' },
      { token: 'muted-foreground', usage: 'Muted text' },
      { token: 'border', usage: 'Default border' },
      { token: 'input', usage: 'Input border' },
      { token: 'ring', usage: 'Focus ring' },
    ],
  },
  {
    title: 'Brand & actions',
    items: [
      { token: 'primary', usage: 'Brand pine, primary actions' },
      { token: 'primary-foreground', usage: 'Text on primary' },
      { token: 'secondary', usage: 'Secondary surface' },
      { token: 'secondary-foreground', usage: 'Text on secondary' },
      { token: 'accent', usage: 'Hover / selected surface' },
      { token: 'accent-foreground', usage: 'Text on accent' },
      { token: 'brass', usage: 'Sparing warm highlight' },
      { token: 'brass-foreground', usage: 'Text on brass' },
    ],
  },
  {
    title: 'Semantic states',
    items: [
      { token: 'success', usage: 'Won deals, healthy metrics' },
      { token: 'warning', usage: 'Needs attention, at-risk' },
      { token: 'destructive', usage: 'Lost deals, delete' },
      { token: 'destructive-foreground', usage: 'Text on destructive' },
    ],
  },
  {
    title: 'Chart series',
    items: [
      { token: 'chart-1', usage: 'Series 1: brand pine' },
      { token: 'chart-2', usage: 'Series 2: brass' },
      { token: 'chart-3', usage: 'Series 3: slate blue' },
      { token: 'chart-4', usage: 'Series 4: clay' },
      { token: 'chart-5', usage: 'Series 5: teal' },
    ],
  },
  {
    title: 'Sidebar',
    items: [
      { token: 'sidebar', usage: 'Sidebar background' },
      { token: 'sidebar-foreground', usage: 'Sidebar text' },
      { token: 'sidebar-primary', usage: 'Active nav item' },
      { token: 'sidebar-primary-foreground', usage: 'Text on active item' },
      { token: 'sidebar-accent', usage: 'Hovered nav item' },
      { token: 'sidebar-accent-foreground', usage: 'Text on hovered item' },
      { token: 'sidebar-border', usage: 'Sidebar border' },
      { token: 'sidebar-ring', usage: 'Focus ring in sidebar' },
    ],
  },
];

const typeGroups = [
  {
    name: 'Display',
    family: 'var(--font-serif)',
    styles: [
      { name: 'display-lg', fontSize: 40, lineHeight: '44px', fontWeight: 500 },
      { name: 'display-md', fontSize: 30, lineHeight: '36px', fontWeight: 500 },
    ],
  },
  {
    name: 'Headings',
    family: 'var(--font-sans)',
    styles: [
      { name: 'h1', fontSize: 24, lineHeight: '30px', fontWeight: 600 },
      { name: 'h2', fontSize: 20, lineHeight: '26px', fontWeight: 600 },
      { name: 'h3', fontSize: 16, lineHeight: '22px', fontWeight: 600 },
    ],
  },
  {
    name: 'Text',
    family: 'var(--font-sans)',
    styles: [
      { name: 'body', fontSize: 15, lineHeight: '23px', fontWeight: 400 },
      { name: 'body-sm', fontSize: 13, lineHeight: '20px', fontWeight: 400 },
      { name: 'label', fontSize: 12, lineHeight: '16px', fontWeight: 500 },
    ],
  },
  {
    name: 'Data',
    family: 'var(--font-mono)',
    styles: [
      { name: 'data', fontSize: 14, lineHeight: '20px', fontWeight: 450 },
      { name: 'data-sm', fontSize: 12, lineHeight: '16px', fontWeight: 450 },
    ],
  },
];

const spaceSteps = [
  { name: 'space-1', px: 4 },
  { name: 'space-2', px: 8 },
  { name: 'space-3', px: 12 },
  { name: 'space-4', px: 16 },
  { name: 'space-6', px: 24 },
  { name: 'space-8', px: 32 },
  { name: 'space-12', px: 48 },
];

const radiusSteps = [
  { name: 'radius-sm', value: 'var(--radius-sm)', px: '4px' },
  { name: 'radius-md', value: 'var(--radius-md)', px: '6px' },
  { name: 'radius-lg', value: 'var(--radius-lg)', px: '8px' },
  { name: 'radius-xl', value: 'var(--radius-xl)', px: '12px' },
  { name: 'radius-full', value: '9999px', px: '9999px' },
];

function SectionHeading({ children }: { children: string }) {
  return (
    <h2
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 20,
        fontWeight: 600,
        margin: '0 0 16px',
      }}
    >
      {children}
    </h2>
  );
}

function ColorScheme({ label, className }: { label: string; className: string }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        padding: 24,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--muted-foreground)',
          margin: '0 0 16px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </h3>
      {colorGroups.map((group) => (
        <div key={group.title} style={{ marginBottom: 20 }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              color: 'var(--muted-foreground)',
              margin: '0 0 8px',
            }}
          >
            {group.title}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            {group.items.map((swatch) => (
              <div
                key={swatch.token}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: 'var(--card)',
                }}
              >
                <div style={{ height: 48, background: `var(--${swatch.token})` }} />
                <div style={{ padding: '6px 8px' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    --{swatch.token}
                  </code>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 11,
                      color: 'var(--muted-foreground)',
                      marginTop: 2,
                    }}
                  >
                    {swatch.usage}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div
      style={{
        padding: 32,
        background: 'var(--muted)',
        minHeight: '100vh',
      }}
    >
      <section style={{ marginBottom: 40 }}>
        <SectionHeading>Color</SectionHeading>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 24,
          }}
        >
          <ColorScheme label="Light" className="" />
          <ColorScheme label="Dark" className="dark" />
        </div>
      </section>

      <section
        style={{
          marginBottom: 40,
          background: 'var(--background)',
          color: 'var(--foreground)',
          padding: 24,
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}
      >
        <SectionHeading>Type scale</SectionHeading>
        {typeGroups.map((group) => (
          <div key={group.name} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--muted-foreground)',
                margin: '0 0 8px',
              }}
            >
              {group.name}
            </div>
            {group.styles.map((style) => (
              <div
                key={style.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  gap: 24,
                  alignItems: 'baseline',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <code
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {style.name} / {style.fontSize}px
                </code>
                <div
                  style={{
                    fontFamily: group.family,
                    fontSize: style.fontSize,
                    lineHeight: style.lineHeight,
                    fontWeight: style.fontWeight,
                  }}
                >
                  Close the Series A before quarter end
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section
        style={{
          marginBottom: 40,
          background: 'var(--background)',
          color: 'var(--foreground)',
          padding: 24,
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}
      >
        <SectionHeading>Spacing</SectionHeading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {spaceSteps.map((step) => (
            <div
              key={step.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: 16,
                alignItems: 'center',
              }}
            >
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {step.name} / {step.px}px
              </code>
              <div
                style={{
                  height: 14,
                  width: step.px,
                  background: 'var(--primary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          background: 'var(--background)',
          color: 'var(--foreground)',
          padding: 24,
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}
      >
        <SectionHeading>Radius</SectionHeading>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {radiusSteps.map((step) => (
            <div key={step.name} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: step.value,
                  marginBottom: 8,
                }}
              />
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {step.name}
              </code>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                }}
              >
                {step.px}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};
