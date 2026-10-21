import 'server-only';
import convertHeic from 'heic-convert';

import { type Admin, downloadObject, storedSize, storeOnce } from './objects';
import { convertOfficeToPdf } from './office-to-pdf';

interface PreviewRendition {
  source: RegExp;
  suffix: string;
  contentType: string;
  maxSourceBytes?: number;
  madeOnView: boolean;
  convert: (original: Uint8Array, name: string) => Promise<Uint8Array>;
}

const PREVIEW_RENDITIONS: PreviewRendition[] = [
  {
    source: /\.hei[cf]$/i,
    suffix: '.preview.jpg',
    contentType: 'image/jpeg',
    maxSourceBytes: 50 * 1024 * 1024,
    madeOnView: true,
    convert: (original) => convertHeic({ buffer: original, format: 'JPEG' }),
  },
  {
    source: /\.pptx$/i,
    suffix: '.preview.pdf',
    contentType: 'application/pdf',
    madeOnView: true,
    convert: convertOfficeToPdf,
  },
  {
    source: /\.docx$/i,
    suffix: '.preview.pdf',
    contentType: 'application/pdf',
    madeOnView: false,
    convert: convertOfficeToPdf,
  },
];

export function previewRendition(name: string): PreviewRendition | undefined {
  return PREVIEW_RENDITIONS.find((candidate) => candidate.source.test(name));
}

export async function ensurePreviewRendition(
  admin: Admin,
  original: { storagePath: string; name: string },
): Promise<void> {
  const rendition = previewRendition(original.name);

  if (!rendition) {
    return;
  }

  const previewPath = `${original.storagePath}${rendition.suffix}`;

  if ((await storedSize(admin, previewPath)) !== null) {
    return;
  }

  if (rendition.maxSourceBytes !== undefined) {
    const sourceBytes = await storedSize(admin, original.storagePath);

    if (sourceBytes !== null && sourceBytes > rendition.maxSourceBytes) {
      return;
    }
  }

  const bytes = await downloadObject(admin, original.storagePath);
  let preview: Uint8Array;

  try {
    preview = await rendition.convert(bytes, original.name);
  } catch (error) {
    throw new Error(`${original.name} could not be converted for preview`, {
      cause: error,
    });
  }

  await storeOnce(admin, previewPath, preview, {
    contentType: rendition.contentType,
  });
}
