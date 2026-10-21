// @vitest-environment jsdom
import { act, type ComponentProps } from "react";

import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

const server = vi.hoisted(() => ({
  updateDealProfile: vi.fn(),
}));

vi.mock("@odb/deals/server", () => server);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { DealProfileForm } from "./deal-profile-form";

const DEAL_ID = "d0000000-0000-4000-8000-000000000001";
const HVAC = "a0000000-0000-4000-8000-000000000001";

const deal: ComponentProps<typeof DealProfileForm>["deal"] = {
  id: DEAL_ID,
  code_name: "Project Cedar",
  firm: { name: "Brennan Climate Services" },
  deal_profile: {
    industry_id: HVAC,
    industry: null,
    location_raw: "Columbus, OH",
    employee_band: "10-24",
    website: null,
    owner_role: "founder",
    reason_for_sale: "retirement",
    year_established: 1987,
  },
};

let container: HTMLDivElement;
let root: Root;
let saved: Mock<() => void>;

function render(change: Partial<typeof deal> = {}) {
  act(() =>
    root.render(
      <DealProfileForm
        deal={{ ...deal, ...change }}
        industries={[{ id: HVAC, name: "HVAC" }]}
        otherBusinessNames={["Harbor Dental"]}
        onSaved={saved}
      />,
    ),
  );
}

function field(label: string): HTMLInputElement {
  const target = [...container.querySelectorAll("label")].find(
    (candidate) => candidate.textContent === label,
  )!;
  return container.querySelector(`#${target.htmlFor}`)!;
}

function type(label: string, value: string) {
  const input = field(label);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function save() {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Save profile",
  )!;
  await act(async () => button.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  server.updateDealProfile.mockReset();
  server.updateDealProfile.mockResolvedValue({ ok: true });
  saved = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DealProfileForm", () => {
  it("starts from the current profile", () => {
    render();

    expect(field("Business name").value).toBe("Brennan Climate Services");
    expect(field("Code name").value).toBe("Project Cedar");
    expect(field("Location").value).toBe("Columbus, OH");
    expect(field("Year established").value).toBe("1987");
    expect(container.textContent).toContain("HVAC");
  });

  it("saves the edited business name and code name with the rest of the profile", async () => {
    render();
    type("Business name", "Brennan Climate Group");
    type("Code name", "Project Birch");

    await save();

    expect(server.updateDealProfile).toHaveBeenCalledWith({
      deal_id: DEAL_ID,
      business_name: "Brennan Climate Group",
      industry_id: HVAC,
      industry: null,
      code_name: "Project Birch",
      location_raw: "Columbus, OH",
      employee_band: "10-24",
      website: null,
      owner_role: "founder",
      reason_for_sale: "retirement",
      year_established: 1987,
    });
    expect(saved).toHaveBeenCalled();
  });

  it("removes the code name when the field is emptied", async () => {
    render();
    type("Code name", "  ");

    await save();

    expect(server.updateDealProfile.mock.calls[0]![0]).toMatchObject({
      code_name: null,
    });
  });

  it("saves emptied profile fields as cleared", async () => {
    render();
    type("Location", "");
    type("Year established", "");

    await save();

    expect(server.updateDealProfile.mock.calls[0]![0]).toMatchObject({
      location_raw: null,
      year_established: null,
    });
  });

  it("warns when another deal in the team already uses the business name", () => {
    render();
    expect(container.textContent).not.toContain("Another deal in this team");

    type("Business name", " harbor dental ");

    expect(container.textContent).toContain(
      "Another deal in this team already uses this business name.",
    );
  });

  it("keeps an industry outside the list as Other with its name", async () => {
    render({
      deal_profile: {
        ...deal.deal_profile,
        industry_id: null,
        industry: "Marinas",
      },
    });
    expect(field("Other industry").value).toBe("Marinas");

    type("Other industry", "Marinas and boatyards");
    await save();

    expect(server.updateDealProfile.mock.calls[0]![0]).toMatchObject({
      industry_id: null,
      industry: "Marinas and boatyards",
    });
  });

  it("shows why the database refused the code name and stays open", async () => {
    server.updateDealProfile.mockResolvedValue({
      ok: false,
      refusal: "Another deal in this team already uses this code name.",
    });
    render();

    await save();

    expect(container.textContent).toContain(
      "Another deal in this team already uses this code name.",
    );
    expect(saved).not.toHaveBeenCalled();
  });
});
