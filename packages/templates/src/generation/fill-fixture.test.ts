import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Editor, fieldAnnotationHelpers } from '@harbour-enterprises/superdoc';
import { describe, expect, it } from 'vitest';

import { createSuperdocEngine } from '../superdoc';

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)),
    ),
  );
}

async function displayLabel(
  docx: Uint8Array,
  fieldId: string,
): Promise<string | undefined> {
  const editor = await Editor.open(Buffer.from(docx), {
    isHeadless: true,
    annotations: true,
  });
  const match = fieldAnnotationHelpers
    .getAllFieldAnnotations(editor.state)
    .find((entry) => entry.node.attrs.fieldId === fieldId);

  return match?.node.attrs.displayLabel as string | undefined;
}

describe('synthetic LOI/APA templates', () => {
  it('fills the standard LOI purchase price through the superdoc engine', async () => {
    const engine = createSuperdocEngine();
    const source = fixture('loi-standard.docx');

    expect(await engine.scanPlaceholders(source)).toContain('purchase_price');
    expect(await displayLabel(source, 'purchase_price')).toBe(
      '{{purchase_price}}',
    );

    const filled = await engine.fill(source, { purchase_price: '$900,000' });

    expect(await displayLabel(filled, 'purchase_price')).toBe('$900,000');
  });
});
