import type { EditorLayout } from '@odb/workflows/builder/editor';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export async function tidyPositions(
  nodes: { id: string; width: number; height: number }[],
  edges: { source: string; target: string }[],
  direction: EditorLayout['direction'],
) {
  const laidOut = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.direction': direction },
    children: nodes,
    edges: edges.map((edge, index) => ({
      id: `e${index}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  return new Map(
    laidOut.children!.map((node) => [node.id, { x: node.x!, y: node.y! }]),
  );
}
