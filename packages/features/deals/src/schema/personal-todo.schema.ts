import { z } from 'zod';

export const createTodoSchema = z.object({
  account_id: z.uuid(),
  deal_id: z.uuid().optional(),
  title: z.string().min(1),
});

export type CreateTodoPayload = z.infer<typeof createTodoSchema>;

export const toggleTodoSchema = z.object({
  id: z.uuid(),
  done: z.boolean(),
});

export const todoIdSchema = z.object({
  id: z.uuid(),
});

export const listTodosSchema = z.object({
  deal_id: z.uuid().optional(),
});
