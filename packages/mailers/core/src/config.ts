import * as z from 'zod';

export const MailerSchema = z
  .object({
    to: z.email(),
    from: z.string().min(1),
    subject: z.string().min(1),
    html: z.string().optional(),
    text: z.string().optional(),
  })
  .refine((value) => value.html !== undefined || value.text !== undefined, {
    message: 'Provide either html or text content',
  });

export type MailerConfig = z.output<typeof MailerSchema>;
