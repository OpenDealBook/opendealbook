import * as z from 'zod';

import type { BrokerCatchUpConfig } from '@odb/workflows';

export const WORKBOOK_WORKFLOW_TYPES = ['broker_catch_up'] as const;

export type WorkbookWorkflowType = (typeof WORKBOOK_WORKFLOW_TYPES)[number];

export const brokerCatchUpConfigSchema = z.object({
  dealLeadUserId: z.string().min(1),
  fromEmail: z.email(),
  subject: z.string().min(1),
  updates: z.string().min(1),
  bookACallUrl: z.url(),
}) satisfies z.ZodType<BrokerCatchUpConfig>;

export const workbookConfigSchemas: Record<WorkbookWorkflowType, z.ZodType> = {
  broker_catch_up: brokerCatchUpConfigSchema,
};

export type WorkbookConfig = z.infer<typeof brokerCatchUpConfigSchema>;

export function parseWorkbookConfig(
  workflowType: string,
  config: unknown,
): WorkbookConfig {
  const schema = workbookConfigSchemas[workflowType as WorkbookWorkflowType];

  if (!schema) {
    throw new Error(`Unknown workbook workflow type: ${workflowType}`);
  }

  return schema.parse(config) as WorkbookConfig;
}
