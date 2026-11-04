import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StageChip } from './stage-chip';

function chipClass(chip: React.ReactElement): string {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(chip);
  return host.querySelector('[data-slot="stage-chip"]')!.className;
}

describe('StageChip', () => {
  it.each([
    ['sourcing', 'bg-stage-early text-stage-early-foreground'],
    ['due_diligence', 'bg-stage-diligence text-stage-diligence-foreground'],
    ['integration', 'bg-stage-close text-stage-close-foreground'],
  ])('colors %s with its stage group token', (stage, tokens) => {
    expect(chipClass(<StageChip stage={stage} />)).toContain(tokens);
  });

  it('colors a lost deal muted red whatever its stage', () => {
    expect(chipClass(<StageChip stage={'due_diligence'} lost />)).toContain(
      'bg-stage-lost text-stage-lost-foreground',
    );
  });

  it('colors a custom stage key as early', () => {
    expect(chipClass(<StageChip stage={'site_visit'} />)).toContain(
      'bg-stage-early text-stage-early-foreground',
    );
  });
});
