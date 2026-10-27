'use server';

import { z } from 'zod';

import { refusableAction } from '@odb/next/actions/refusable-action';

import { saveOutreachSetting } from './save-outreach-setting';

const NEEDS_DEALS_MANAGE = 'Changing the return address needs deals.manage';

export const saveLetterReturnAddressAction = refusableAction(
  async ({ accountId, name, addressLine1, city, state, postalCode }) => {
    await saveOutreachSetting(
      accountId,
      {
        letter_return_name: name,
        letter_return_address_line1: addressLine1,
        letter_return_city: city,
        letter_return_state: state,
        letter_return_postal_code: postalCode,
      },
      NEEDS_DEALS_MANAGE,
    );
  },
  z.object({
    accountId: z.uuid(),
    name: z.string().min(1),
    addressLine1: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
  }),
);
