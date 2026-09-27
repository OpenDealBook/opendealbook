import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
  title: 'Tokens/Spacing',
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj;

const steps = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 24];
const base = 4;

export const Scale: Story = {
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
        Spacing
      </h2>
      <p
        style={{
          fontSize: 13,
          color: 'var(--muted-foreground)',
          margin: '0 0 24px',
        }}
      >
        Tailwind spacing steps on a 4px base, shown as bars.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((step) => {
          const px = step * base;
          return (
            <div
              key={step}
              style={{
                display: 'grid',
                gridTemplateColumns: '96px 1fr',
                gap: 16,
                alignItems: 'center',
              }}
            >
              <code
                style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace' }}
              >
                {step} · {px}px
              </code>
              <div
                style={{
                  height: 16,
                  width: px,
                  background: 'var(--primary)',
                  borderRadius: 4,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  ),
};
