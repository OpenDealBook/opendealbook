export type ViewerKind =
  | 'pdf'
  | 'image'
  | 'word'
  | 'sheet'
  | 'msg'
  | 'eml'
  | 'text'
  | 'none';

const KIND_BY_EXTENSION: Record<string, ViewerKind> = {
  pdf: 'pdf',
  // The preview URL of a PowerPoint file serves a PDF rendition made at upload.
  pptx: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  // The preview URL of a HEIC or HEIF file serves a JPEG rendition made at upload.
  heic: 'image',
  heif: 'image',
  docx: 'word',
  xlsx: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
  msg: 'msg',
  eml: 'eml',
  txt: 'text',
  md: 'text',
  json: 'text',
  log: 'text',
  xml: 'text',
  yaml: 'text',
  yml: 'text',
};

export function viewerKind(fileName: string): ViewerKind {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';
  return KIND_BY_EXTENSION[extension] ?? 'none';
}
