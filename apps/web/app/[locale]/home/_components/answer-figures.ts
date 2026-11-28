import type {
  Paragraph,
  Parent,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast';

import type { AnswerPart } from '@odb/ai/parts';

const MARKER = /\[\[figure (\d+)\]\]/g;
const FIGURE_TAG = /<\/?figure[\s/>]/i;

function figureNode(index: number): Paragraph {
  return {
    type: 'paragraph',
    data: { hName: 'figure', hProperties: { index: String(index) } },
    children: [],
  };
}

function isEmpty(node: RootContent): boolean {
  if (node.type === 'text') {
    return node.value.trim() === '';
  }
  return 'children' in node && node.children.every(isEmpty);
}

function isFigureTag(node: RootContent): boolean {
  return node.type === 'html' && FIGURE_TAG.test(node.value);
}

export function remarkFigures({ parts }: { parts: AnswerPart[] }) {
  return (tree: Root) => {
    const placed = new Set<number>();

    function splitText(value: string): (string | number)[] {
      const pieces: (string | number)[] = [];
      let at = 0;
      for (const match of value.matchAll(MARKER)) {
        pieces.push(value.slice(at, match.index));
        const index = parts.findIndex((part) => part.id === Number(match[1]));
        if (index !== -1 && !placed.has(index)) {
          placed.add(index);
          pieces.push(index);
        }
        at = match.index + match[0].length;
      }
      pieces.push(value.slice(at));
      return pieces.filter((piece) => piece !== '');
    }

    function lift(parent: Parent): number[] {
      const lifted: number[] = [];
      parent.children = parent.children.flatMap((child): RootContent[] => {
        if (child.type === 'text') {
          return splitText(child.value).flatMap((piece) => {
            if (typeof piece === 'number') {
              lifted.push(piece);
              return [];
            }
            return [{ type: 'text', value: piece }];
          });
        }
        if (isFigureTag(child)) {
          return [];
        }
        if ('children' in child) {
          const inner = lift(child);
          lifted.push(...inner);
          if (
            inner.length > 0 &&
            isEmpty(child) &&
            child.type !== 'tableCell'
          ) {
            return [];
          }
        }
        return [child];
      });
      return lifted;
    }

    function splitParagraph(paragraph: Paragraph): RootContent[] {
      const blocks: RootContent[] = [];
      const lifted: number[] = [];
      let run: PhrasingContent[] = [];
      const flush = () => {
        if (run.some((node) => !isEmpty(node))) {
          blocks.push({ type: 'paragraph', children: run });
        }
        run = [];
      };
      for (const child of paragraph.children) {
        if (child.type !== 'text') {
          const inner = 'children' in child ? lift(child) : [];
          lifted.push(...inner);
          if (!isFigureTag(child) && !(inner.length > 0 && isEmpty(child))) {
            run.push(child);
          }
          continue;
        }
        for (const piece of splitText(child.value)) {
          if (typeof piece === 'number') {
            flush();
            blocks.push(figureNode(piece));
          } else {
            run.push({ type: 'text', value: piece });
          }
        }
      }
      flush();
      return [...blocks, ...lifted.map(figureNode)];
    }

    tree.children = tree.children.flatMap((block): RootContent[] => {
      if (block.type === 'paragraph') {
        return splitParagraph(block);
      }
      if (isFigureTag(block)) {
        return [];
      }
      if (!('children' in block)) {
        return [block];
      }
      const lifted = lift(block).map(figureNode);
      return lifted.length > 0 && isEmpty(block) ? lifted : [block, ...lifted];
    });
    tree.children.push(
      ...parts.flatMap((_, index) =>
        placed.has(index) ? [] : [figureNode(index)],
      ),
    );
  };
}
