const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
  txt: 'text/plain',
  csv: 'text/csv',
};

export function contentTypeFor(name: string): string {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();

  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}
