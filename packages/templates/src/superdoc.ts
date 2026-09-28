import type { Editor, FieldValue } from '@harbour-enterprises/superdoc';

export interface DocxTemplateEngine {
  scanPlaceholders(docx: Uint8Array): Promise<string[]>;
  fill(docx: Uint8Array, values: Record<string, string>): Promise<Uint8Array>;
}

// Single SuperDoc contact point; every other module depends only on
// DocxTemplateEngine. @harbour-enterprises/superdoc exposes a headless Editor for
// loading, field annotation, and DOCX export. PDF rendering lives outside this
// engine; see convertDocxToPdf.
export function createSuperdocEngine(): DocxTemplateEngine {
  return {
    async scanPlaceholders(docx) {
      const { editor, helpers } = await loadHeadless(docx);
      const annotations = helpers.getAllFieldAnnotations(editor.state);
      const ids = annotations.map(
        (entry) => entry.node.attrs.fieldId as string,
      );

      return [...new Set(ids)];
    },
    async fill(docx, values) {
      const { editor } = await loadHeadless(docx);
      const annotationValues: FieldValue[] = Object.entries(values).map(
        ([input_id, input_value]) => ({ input_id, input_value }),
      );

      editor.prepareForAnnotations(annotationValues);
      editor.annotate(annotationValues);

      return editor.exportDocx<Buffer>();
    },
  };
}

async function loadHeadless(docx: Uint8Array) {
  const { Editor: EditorClass, fieldAnnotationHelpers } =
    await import('@harbour-enterprises/superdoc');
  const editor: Editor = await EditorClass.open(Buffer.from(docx), {
    isHeadless: true,
  });

  return { editor, helpers: fieldAnnotationHelpers };
}
