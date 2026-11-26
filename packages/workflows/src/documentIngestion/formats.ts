const FORMATS = {
  pdf: 'pdf',
  docx: 'office',
  doc: 'office',
  pptx: 'office',
  ppt: 'office',
  xlsx: 'xlsx',
  xls: 'xls',
  csv: 'csv',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  tif: 'image',
  tiff: 'image',
  txt: 'text',
  md: 'text',
} as const;

export type IngestibleFormat = (typeof FORMATS)[keyof typeof FORMATS];

export function ingestibleFormat(name: string): IngestibleFormat | null {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
  return Object.hasOwn(FORMATS, extension)
    ? FORMATS[extension as keyof typeof FORMATS]
    : null;
}
