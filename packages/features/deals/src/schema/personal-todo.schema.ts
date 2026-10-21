import { z } from 'zod';

export const createTodoSchema = z.object({
  account_id: z.uuid(),
  deal_id: z.uuid(),
  title: z.string().min(1),
  due_on: z.iso.date().optional(),
  assignee_user_id: z.uuid(),
});

export type CreateTodoPayload = z.infer<typeof createTodoSchema>;

export const assignTodoSchema = z.object({
  id: z.uuid(),
  assignee_user_id: z.uuid(),
});

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
