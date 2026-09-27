import type { ContentStatus } from './cms';

export interface ContentItem {
  id: string;
  slug: string;
  title: string;
  content: unknown;
  description?: string;
  publishedAt: string;
  status: ContentStatus;
  categories?: string[];
  tags?: string[];
  author?: string;
  image?: string;
  order?: number;
  parentId?: string;
  children?: ContentItem[];
}
