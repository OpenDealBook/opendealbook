import { z } from 'zod';

export const titleSchema = z.string().trim().min(1, 'A form needs a title');

export const noteSchema = z.string().trim().optional();
