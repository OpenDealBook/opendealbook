import type { DoclingDocument, DoclingNode } from './docling';

export interface PageText {
  page_from: number;
  page_to: number;
  text: string;
}

export const SEGMENT_MAX_CHARS = 32_000;

type Grid = NonNullable<DoclingNode['data']>['grid'];

interface Item {
  node: DoclingNode;
  page: number;
  pageTo: number;
}

export function pageSegments(document: DoclingDocument): PageText[] {
  const segments: PageText[] = [];
  let previous: { page: number; header: Grid } | null = null;

  for (const item of itemsInReadingOrder(document)) {
    let texts: string[];
    if (item.node.data) {
      const grid = item.node.data.grid;
      const carried: Grid | null =
        previous &&
        previous.page < item.page &&
        headerRows(grid).length === 0 &&
        previous.header[0]?.length === grid[0]?.length
          ? previous.header
          : null;
      const header: Grid = carried ?? headerOrFirstRow(grid);
      texts = renderTable(header, carried ? grid : grid.slice(header.length));
      previous = { page: item.page, header };
    } else {
      texts = [renderText(item.node)];
      previous = null;
    }

    for (const text of texts) {
      const last = segments.at(-1);
      if (
        last?.page_from === item.page &&
        last.text.length + 2 + text.length <= SEGMENT_MAX_CHARS
      ) {
        last.text = `${last.text}\n\n${text}`;
        last.page_to = Math.max(last.page_to, item.pageTo);
      } else {
        segments.push({ page_from: item.page, page_to: item.pageTo, text });
      }
    }
  }

  return segments.sort((a, b) => a.page_from - b.page_from);
}

function itemsInReadingOrder(document: DoclingDocument): Item[] {
  const items: Item[] = [];
  const visit = (node: DoclingNode) => {
    if (node.prov?.length && (node.text || node.data)) {
      const pageNumbers = node.prov.map((prov) => prov.page_no);
      items.push({
        node,
        page: pageNumbers[0]!,
        pageTo: Math.max(...pageNumbers),
      });
    }
    for (const child of node.children) {
      visit(resolve(document, child.$ref));
    }
  };
  visit(document.body);
  return items;
}

function resolve(document: DoclingDocument, ref: string): DoclingNode {
  const [, collection, index] = ref.split('/') as [
    string,
    'groups' | 'texts' | 'tables' | 'pictures',
    string,
  ];
  return document[collection][Number(index)]!;
}

function renderText(node: DoclingNode): string {
  if (node.label === 'title') {
    return `# ${node.text}`;
  }
  if (node.label === 'section_header') {
    return `${'#'.repeat((node.level ?? 1) + 1)} ${node.text}`;
  }
  if (node.label === 'list_item') {
    return `- ${node.text}`;
  }
  return node.text!;
}

function headerRows(grid: Grid): Grid {
  const end = grid.findIndex((row) => !row.some((cell) => cell.column_header));
  return grid.slice(0, end === -1 ? grid.length : end);
}

function headerOrFirstRow(grid: Grid): Grid {
  const header = headerRows(grid);
  return header.length > 0 ? header : grid.slice(0, 1);
}

function renderTable(header: Grid, body: Grid): string[] {
  const row = (cells: Grid[number]) =>
    `| ${cells.map((cell) => cell.text.replaceAll('|', '\\|').replaceAll('\n', ' ')).join(' | ')} |`;
  const heading = [
    ...header.map(row),
    `| ${header[0]!.map(() => '---').join(' | ')} |`,
  ].join('\n');

  const pieces: string[] = [];
  let current = heading;
  let rows = 0;
  for (const line of body.map(row)) {
    if (rows > 0 && current.length + 1 + line.length > SEGMENT_MAX_CHARS) {
      pieces.push(current);
      current = heading;
      rows = 0;
    }
    current = `${current}\n${line}`;
    rows += 1;
  }
  pieces.push(current);
  return pieces;
}
