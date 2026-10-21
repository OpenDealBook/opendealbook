import * as z from 'zod';

export const MailerSchema = z
  .object({
    to: z.email(),
    from: z.string().min(1),
    replyTo: z.email().optional(),
    subject: z.string().min(1),
    html: z.string().optional(),
    text: z.string().optional(),
    attachments: z
      .array(
        z.object({
          filename: z.string().min(1),
          content: z.instanceof(Uint8Array),
          contentType: z.string().min(1),
        }),
      )
      .optional(),
  })
  .refine((value) => value.html !== undefined || value.text !== undefined, {
    message: 'Provide either html or text content',
  });

export type MailerConfig = z.output<typeof MailerSchema>;
