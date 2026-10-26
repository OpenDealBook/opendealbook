import { expect, it } from 'vitest';

import { tidyPositions } from './workflow-editor-tidy';

const nodes = ['start', 'check', 'notify'].map((id) => ({
  id,
  width: 200,
  height: 80,
}));
const edges = [
  { source: 'start', target: 'check' },
  { source: 'check', target: 'notify' },
];

it('lays a chain out left to right without overlap', async () => {
  const positions = await tidyPositions(nodes, edges, 'RIGHT');
  const xs = ['start', 'check', 'notify'].map((id) => positions.get(id)!.x);

  expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(200);
  expect(xs[2]! - xs[1]!).toBeGreaterThanOrEqual(200);
});

it('lays a chain out top to bottom without overlap', async () => {
  const positions = await tidyPositions(nodes, edges, 'DOWN');
  const ys = ['start', 'check', 'notify'].map((id) => positions.get(id)!.y);

  expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(80);
  expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(80);
});
