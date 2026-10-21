import { describe, expect, it } from "vitest";

import { dealCalcInputsSchema } from "./calc.schema";
import { dealBoxCriteriaSchema } from "./deal-box.schema";
import { dealSchema } from "./deal.schema";

const account_id = "11111111-1111-4111-8111-111111111111";

describe("dealSchema business identity", () => {
  const identified = {
    account_id,
    business_name: "Acme Plumbing",
    industry: "Home Services",
  };

  it("accepts a deal with a business name and an industry", () => {
    expect(dealSchema.safeParse(identified).success).toBe(true);
  });

  it("refuses a blank business name", () => {
    expect(
      dealSchema.safeParse({ ...identified, business_name: " " }).error
        ?.issues[0]?.message,
    ).toBe("Enter the business name.");
  });

  it("refuses a deal with no industry picked or typed", () => {
    expect(
      dealSchema.safeParse({ ...identified, industry: " " }).error?.issues[0]
        ?.message,
    ).toBe("Pick an industry.");
  });

  it("drops a sample-deal mark sent by a client", () => {
    expect(
      dealSchema.parse({ ...identified, capture_method: "example" }),
    ).not.toHaveProperty("capture_method");
  });
});

describe("dealBoxCriteriaSchema naics target", () => {
  it("carries a target NAICS list through parsing", () => {
    expect(
      dealBoxCriteriaSchema.parse({ naics: ["541211", "541219"] }).naics,
    ).toEqual(["541211", "541219"]);
  });

  it("stays valid for an existing deal box that carries no naics", () => {
    const parsed = dealBoxCriteriaSchema.safeParse({
      industries: ["Accounting"],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.naics).toBeUndefined();
  });
});

describe("dealCalcInputsSchema minimum DSCR", () => {
  const inputs = {
    pl: {
      sales: 0,
      cogs: 0,
      opex: 0,
      depreciation_amortization: 0,
      taxes: 0,
      interest: 0,
      owner_benefits: 0,
    },
    purchase_price: 0,
  };

  it("refuses a minimum DSCR of zero or below", () => {
    expect(
      dealCalcInputsSchema.safeParse({ ...inputs, reference_line: 0 }).success,
    ).toBe(false);
    expect(
      dealCalcInputsSchema.safeParse({ ...inputs, reference_line: -1 }).success,
    ).toBe(false);
  });

  it("accepts a positive minimum DSCR", () => {
    expect(
      dealCalcInputsSchema.safeParse({ ...inputs, reference_line: 1.25 })
        .success,
    ).toBe(true);
  });
});
