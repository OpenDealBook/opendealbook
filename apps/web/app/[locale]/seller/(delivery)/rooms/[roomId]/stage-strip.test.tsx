import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StageStrip } from './stage-strip';

describe('StageStrip', () => {
  it('shows the five public stages and marks the current one', () => {
    const html = renderToStaticMarkup(<StageStrip current={'Diligence'} />);
    const stages = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(
      (match) => match[0],
    );

    expect(stages.map((stage) => stage.replace(/<[^>]+>/g, ''))).toEqual([
      'Talking',
      'LOI',
      'Diligence',
      'Closing',
      'Closed',
    ]);
    expect(stages.filter((stage) => stage.includes('aria-current'))).toEqual([
      expect.stringContaining('Diligence'),
    ]);
  });
});
