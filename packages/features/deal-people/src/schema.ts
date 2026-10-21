import { z } from 'zod';

const blankAsNull = (value: string) => value || null;

export const contactRoles = [
  'principal',
  'attorney',
  'broker',
  'cpa',
  'other',
] as const;

export const dealSides = ['buyer', 'seller', 'lender'] as const;

const contactFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Give the contact a name.'),
  role: z.enum(contactRoles),
  side: z.enum(dealSides),
  company: z.string().trim().transform(blankAsNull),
  phone: z.string().trim().transform(blankAsNull),
  email: z.string().trim().transform(blankAsNull),
});

export type ContactFields = z.input<typeof contactFieldsSchema>;

export const addContactSchema = contactFieldsSchema.extend({
  dealId: z.uuid(),
});

export const editContactSchema = addContactSchema.extend({
  contactId: z.uuid(),
});

export const removeContactSchema = z.object({
  dealId: z.uuid(),
  contactId: z.uuid(),
});

export const attachContactSchema = removeContactSchema.extend({
  role: z.enum(contactRoles),
  side: z.enum(dealSides),
});

const mainContactSlotSchema = z.object({
  dealId: z.uuid(),
  side: z.enum(dealSides),
  lenderRoomId: z.uuid().nullable(),
});

export const starSchema = mainContactSlotSchema.extend({
  who: z.union([
    z.object({ userId: z.uuid() }),
    z.object({ contactId: z.uuid() }),
  ]),
});

export const unstarSchema = mainContactSlotSchema;

const entryFields = {
  name: z.string().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  side: z.enum(dealSides),
  lender_room_id: z.string().nullable(),
  room_closed: z.boolean().nullable(),
  is_main: z.boolean(),
};

const contactEntrySchema = z.object({
  ...entryFields,
  source: z.literal('contact'),
  contact_id: z.string(),
  role: z.enum(contactRoles),
});

const pulledEntrySchema = z.object({
  ...entryFields,
  source: z.enum(['team', 'lender_room', 'seller_room', 'counsel']),
  contact_id: z.null(),
  role: z.enum(['principal', 'lender', 'seller', 'attorney']),
});

const pulledPersonSchema = z
  .object({
    user_id: z.string(),
    email: z.string(),
    name: z.string(),
    entries: z.array(
      z.discriminatedUnion('source', [contactEntrySchema, pulledEntrySchema]),
    ),
  })
  .transform((person) => ({
    ...person,
    entries: person.entries.map((entry) =>
      entry.source === 'contact'
        ? entry
        : { ...entry, user_id: person.user_id },
    ),
  }));

const contactPersonSchema = z.object({
  user_id: z.null(),
  email: z.string().nullable(),
  name: z.string(),
  entries: z.array(contactEntrySchema),
});

export const dealPeopleSchema = z.array(
  z.union([pulledPersonSchema, contactPersonSchema]),
);
