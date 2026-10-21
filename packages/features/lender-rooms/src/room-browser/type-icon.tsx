import {
  FileArchiveIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  type LucideIcon,
  MailIcon,
  PresentationIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  PDF: FileTextIcon,
  TXT: FileTextIcon,
  MD: FileTextIcon,
  DOC: FileTypeIcon,
  DOCX: FileTypeIcon,
  XLS: FileSpreadsheetIcon,
  XLSX: FileSpreadsheetIcon,
  CSV: FileSpreadsheetIcon,
  PNG: FileImageIcon,
  JPG: FileImageIcon,
  JPEG: FileImageIcon,
  GIF: FileImageIcon,
  WEBP: FileImageIcon,
  HEIC: FileImageIcon,
  MSG: MailIcon,
  EML: MailIcon,
  PPT: PresentationIcon,
  PPTX: PresentationIcon,
  ZIP: FileArchiveIcon,
};

export function TypeIcon({
  type,
  className,
}: {
  type: string;
  className: string;
}) {
  const Icon = icons[type] ?? FileIcon;

  return <Icon aria-hidden className={className} />;
}
