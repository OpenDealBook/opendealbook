import { createClient } from "@supabase/supabase-js";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@odb/supabase";

import {
  type IntegrationAccount,
  provisionAccount,
} from "../../test-support/integration-harness";

const holder = vi.hoisted(() => ({
  client: null as unknown,
  userId: "",
}));

vi.mock("@odb/next/actions", () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user?: { id: string }) =>
      fn(data, user ?? { id: holder.userId }),
}));

vi.mock("@odb/supabase/server", () => ({
  getSupabaseServerClient: () => holder.client,
}));

import { createDealCore } from "./deal-actions";
import { updateDealProfile } from "./profile-actions";

let account: IntegrationAccount;

const BLANK_PROFILE = {
  industry_id: null,
  industry: null,
  code_name: null,
  location_raw: null,
  employee_band: null,
  website: null,
  owner_role: null,
  reason_for_sale: null,
  year_established: null,
};

function newDeal(businessName: string): Promise<string> {
  return createDealCore(
    account.user,
    {
      account_id: account.accountId,
      business_name: businessName,
      industry: "Accounting",
      source: "manual",
      stage: "sourcing",
    },
    account.userId,
  );
}

async function unconfirmName(dealId: string) {
  const { data: deal } = await account.admin
    .from("deal")
    .select("firm_id")
    .eq("id", dealId)
    .single()
    .throwOnError();
  await account.admin
    .from("firm")
    .update({ name_confirmed: false })
    .eq("id", deal.firm_id!)
    .throwOnError();
}

async function signedInMember() {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = `int-member-${unique}@odb.test`;
  const password = `Pw-${unique}-Aa1!`;
  const { data } = await account.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  await account.admin
    .from("accounts_memberships")
    .insert({
      account_id: account.accountId,
      user_id: data.user!.id,
      account_role: "member",
    })
    .throwOnError();
  const member = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    (account.user as unknown as { supabaseKey: string }).supabaseKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  await member.auth.signInWithPassword({ email, password });
  return member;
}

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  holder.userId = account.userId;
});

afterAll(async () => {
  await account.cleanup();
});

describe("updateDealProfile (integration)", () => {
  it("saves the business name as confirmed, the code name, industry and profile", async () => {
    const dealId = await newDeal("Guessed From Description");
    await unconfirmName(dealId);
    const { data: industry } = await account.admin
      .from("industry")
      .insert({ account_id: account.accountId, name: "Home Services" })
      .select("id")
      .single()
      .throwOnError();

    const result = await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Brennan Climate Services",
      industry_id: industry.id,
      industry: null,
      code_name: "  Project Cedar ",
      location_raw: "Columbus, OH",
      employee_band: "10-24",
      website: "https://brennan.example",
      owner_role: "founder",
      reason_for_sale: "retirement",
      year_established: 1987,
    });

    expect(result).toEqual({ ok: true, value: undefined });
    const { data: deal } = await account.admin
      .from("deal")
      .select(
        "code_name, firm!inner(name, name_confirmed), deal_profile(industry_id, location_raw, employee_band, website, owner_role, reason_for_sale, year_established)",
      )
      .eq("id", dealId)
      .single()
      .throwOnError();
    expect(deal).toEqual({
      code_name: "Project Cedar",
      firm: { name: "Brennan Climate Services", name_confirmed: true },
      deal_profile: {
        industry_id: industry.id,
        location_raw: "Columbus, OH",
        employee_band: "10-24",
        website: "https://brennan.example",
        owner_role: "founder",
        reason_for_sale: "retirement",
        year_established: 1987,
      },
    });
  });

  it("moves the industry between the team list and Other", async () => {
    const dealId = await newDeal("Marina Holdings");
    const { data: industry } = await account.admin
      .from("industry")
      .insert({ account_id: account.accountId, name: "Boating" })
      .select("id")
      .single()
      .throwOnError();
    const industryOf = async () =>
      (
        await account.admin
          .from("deal_profile")
          .select("industry_id, industry")
          .eq("deal_id", dealId)
          .single()
          .throwOnError()
      ).data;

    await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Marina Holdings",
      industry_id: industry.id,
      industry: null,
      code_name: null,
    });
    expect(await industryOf()).toEqual({
      industry_id: industry.id,
      industry: null,
    });

    await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Marina Holdings",
      industry_id: null,
      industry: "Marinas",
      code_name: null,
    });
    expect(await industryOf()).toEqual({
      industry_id: null,
      industry: "Marinas",
    });
  });

  it("clears profile fields that are emptied", async () => {
    const dealId = await newDeal("Ridge Landscaping");
    const save = (fields: Record<string, string | number | null>) =>
      updateDealProfile({
        ...BLANK_PROFILE,
        deal_id: dealId,
        business_name: "Ridge Landscaping",
        industry_id: null,
        industry: "Landscaping",
        code_name: null,
        location_raw: null,
        employee_band: null,
        website: null,
        owner_role: null,
        reason_for_sale: null,
        year_established: null,
        ...fields,
      });
    await save({
      location_raw: "Boise, ID",
      employee_band: "5-9",
      website: "https://ridge.example",
      owner_role: "founder",
      reason_for_sale: "retirement",
      year_established: 2004,
    });

    await save({});

    const { data: profile } = await account.admin
      .from("deal_profile")
      .select(
        "location_raw, employee_band, website, owner_role, reason_for_sale, year_established",
      )
      .eq("deal_id", dealId)
      .single()
      .throwOnError();
    expect(profile).toEqual({
      location_raw: null,
      employee_band: null,
      website: null,
      owner_role: null,
      reason_for_sale: null,
      year_established: null,
    });
  });

  it("clears the code name", async () => {
    const dealId = await newDeal("Harbor Dental");
    await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Harbor Dental",
      industry_id: null,
      industry: "Dental",
      code_name: "Project Tide",
    });

    await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Harbor Dental",
      industry_id: null,
      industry: "Dental",
      code_name: null,
    });

    const { data: deal } = await account.admin
      .from("deal")
      .select("code_name")
      .eq("id", dealId)
      .single()
      .throwOnError();
    expect(deal.code_name).toBeNull();
  });

  it("refuses a code name that contains the business name", async () => {
    const dealId = await newDeal("Oakline Plumbing");

    const result = await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Oakline Plumbing",
      industry_id: null,
      industry: "Plumbing",
      code_name: "Project oakline plumbing west",
    });

    expect(result).toEqual({
      ok: false,
      refusal: "A code name must not contain the business name.",
    });
  });

  it("refuses a code name another deal in the team uses, ignoring case", async () => {
    const first = await newDeal("Summit Roofing");
    const second = await newDeal("Valley Roofing");
    await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: first,
      business_name: "Summit Roofing",
      industry_id: null,
      industry: "Roofing",
      code_name: "Project Granite",
    });

    const result = await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: second,
      business_name: "Valley Roofing",
      industry_id: null,
      industry: "Roofing",
      code_name: "project granite",
    });

    expect(result).toEqual({
      ok: false,
      refusal: "Another deal in this team already uses this code name.",
    });
  });

  it("refuses a code name shorter than 2 characters", async () => {
    const dealId = await newDeal("Lakeside Bakery");

    const result = await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Lakeside Bakery",
      industry_id: null,
      industry: "Food",
      code_name: " Q ",
    });

    expect(result).toEqual({
      ok: false,
      refusal: "A code name must be 2 to 40 characters.",
    });
  });

  it("refuses a team member without deal-manager rights and leaves the name alone", async () => {
    const dealId = await newDeal("Pine Street Auto");
    await account.admin
      .from("accounts")
      .update({ name: "Morgan Reyes" })
      .eq("primary_owner_user_id", account.userId)
      .eq("is_personal_account", true)
      .throwOnError();
    holder.client = await signedInMember();

    const result = await updateDealProfile({
      ...BLANK_PROFILE,
      deal_id: dealId,
      business_name: "Renamed Auto",
      industry_id: null,
      industry: "Automotive",
      code_name: null,
    });
    holder.client = account.user;

    expect(result).toEqual({
      ok: false,
      refusal:
        "Only deal managers can edit the deal profile. Ask Morgan Reyes.",
    });
    const { data: deal } = await account.admin
      .from("deal")
      .select("firm!inner(name)")
      .eq("id", dealId)
      .single()
      .throwOnError();
    expect(deal.firm.name).toBe("Pine Street Auto");
  });
});
