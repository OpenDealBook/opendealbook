import { z } from 'zod';

export const cmsCollectionSchema = z.enum(['posts', 'documentation']);

export type CmsCollection = z.infer<typeof cmsCollectionSchema>;

export const contentStatusSchema = z.enum(['draft', 'published', 'review']);

export type ContentStatus = z.infer<typeof contentStatusSchema>;
