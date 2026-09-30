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
  category?: string;
  tags?: string[];
  author?: string;
  image?: string;
  cover?: string;
  order?: number;
  parentId?: string;
  children?: ContentItem[];
}
