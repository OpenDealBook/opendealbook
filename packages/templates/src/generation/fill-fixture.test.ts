import { Editor, fieldAnnotationHelpers } from '@harbour-enterprises/superdoc';
import { describe, expect, it } from 'vitest';

import { createSuperdocEngine } from '../superdoc';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

async function bodyText(docx: Uint8Array): Promise<string> {
  const editor = await Editor.open(Buffer.from(docx), {
    isHeadless: true,
    annotations: true,
  });

  return editor.state.doc.textContent;
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

    expect(await bodyText(filled)).toContain('$900,000');
  }, 30000);

  it('leaves the filled value as plain text so the pdf renders it cleanly', async () => {
    const engine = createSuperdocEngine();
    const filled = await engine.fill(fixture('loi-standard.docx'), {
      purchase_price: '$900,000',
    });

    expect(await engine.scanPlaceholders(filled)).not.toContain(
      'purchase_price',
    );
    expect(await bodyText(filled)).toContain('$900,000');
  }, 30000);
});
