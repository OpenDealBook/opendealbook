import { z } from 'zod';

const name = z.string().trim().min(1, "Enter the lender's name");
const website = z.string().trim().min(1, 'Enter the lender website');

const optionalProfile = {
  rateType: z.enum(['fixed', 'variable', 'either']).nullish(),
  typicalRate: z.number().nullish(),
  maxLoan: z.number().nullish(),
  sbaPreferred: z.boolean().optional(),
  industries: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullish(),
};

export const addLenderInput = z.object({
  accountId: z.uuid(),
  name,
  website,
  ...optionalProfile,
});

export const editLenderInput = z.object({
  lenderId: z.uuid(),
  name: name.optional(),
  website: website.optional(),
  ...optionalProfile,
});

export const lenderIdInput = z.object({ lenderId: z.uuid() });

const contactFields = {
  name: z.string().trim().min(1, "Enter the contact's name"),
  email: z.string(),
  phone: z.string(),
};

export const addLenderContactInput = z.object({
  lenderId: z.uuid(),
  name: contactFields.name,
  email: contactFields.email.optional(),
  phone: contactFields.phone.optional(),
});

export const editLenderContactInput = z.object({
  contactId: z.uuid(),
  name: contactFields.name.optional(),
  email: contactFields.email.nullish(),
  phone: contactFields.phone.nullish(),
});

export const lenderContactIdInput = z.object({ contactId: z.uuid() });
