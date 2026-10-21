"use server";

import { getSupabaseServerClient } from "@odb/supabase/server";

import { updateDealProfileSchema } from "../schema/deal.schema";
import { Refusal, refusableAction } from "./refusal";

function throwAsCodeNameRefusal(error: {
  code?: string;
  message: string;
}): never {
  if (error.code === "23505") {
    throw new Refusal("Another deal in this team already uses this code name.");
  }

  if (error.code === "23514") {
    throw new Refusal(
      error.message.includes("business name")
        ? "A code name must not contain the business name."
        : "A code name must be 2 to 40 characters.",
    );
  }

  throw error;
}

export const updateDealProfile = refusableAction(
  async ({ deal_id, business_name, ...profile }) => {
    const { error } = await getSupabaseServerClient().rpc(
      "update_deal_profile",
      {
        p_deal_id: deal_id,
        p_business_name: business_name,
        p_payload: profile,
      },
    );

    if (error) {
      throwAsCodeNameRefusal(error);
    }
  },
  updateDealProfileSchema,
  {
    what: "edit the deal profile",
    needs: "deals.manage",
    dealId: (data) => data.deal_id,
  },
);
