"use client";

import { type ReactNode, useState } from "react";

import { updateDealProfile } from "@odb/deals/server";
import type { Tables } from "@odb/supabase";
import { Button } from "@odb/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@odb/ui/dialog";
import { Input } from "@odb/ui/input";
import { Label } from "@odb/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@odb/ui/select";

import { GatedControl } from "./gated-control";
import { useRefusableAction } from "./use-refusable-action";

const OTHER_INDUSTRY = "other";

const MANAGERS_ONLY = "Only deal managers can edit the deal profile.";

export type ProfileDeal = {
  id: string;
  code_name: string | null;
  firm: { name: string };
  deal_profile: Pick<
    Tables<"deal_profile">,
    | "industry_id"
    | "industry"
    | "location_raw"
    | "employee_band"
    | "website"
    | "owner_role"
    | "reason_for_sale"
    | "year_established"
  >;
};

type Industry = { id: string; name: string };

function toText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  type,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: "number";
}) {
  return (
    <div className={"flex flex-col gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className={"text-muted-foreground text-xs"}>{hint}</p> : null}
    </div>
  );
}

export function DealProfileForm({
  deal,
  industries,
  otherBusinessNames,
  onSaved,
}: {
  deal: ProfileDeal;
  industries: Industry[];
  otherBusinessNames: string[];
  onSaved: () => void;
}) {
  const profile = deal.deal_profile;
  const { refusal, pending, run } = useRefusableAction();

  const [businessName, setBusinessName] = useState(deal.firm.name);
  const [industryChoice, setIndustryChoice] = useState(
    profile.industry_id ?? (profile.industry === null ? "" : OTHER_INDUSTRY),
  );
  const [otherIndustry, setOtherIndustry] = useState(profile.industry ?? "");
  const [codeName, setCodeName] = useState(deal.code_name ?? "");
  const [locationRaw, setLocationRaw] = useState(profile.location_raw ?? "");
  const [employeeBand, setEmployeeBand] = useState(profile.employee_band ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [ownerRole, setOwnerRole] = useState(profile.owner_role ?? "");
  const [reasonForSale, setReasonForSale] = useState(
    profile.reason_for_sale ?? "",
  );
  const [yearEstablished, setYearEstablished] = useState(
    profile.year_established?.toString() ?? "",
  );

  const duplicateName = otherBusinessNames.some(
    (name) => name.trim().toLowerCase() === businessName.trim().toLowerCase(),
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = toText(yearEstablished);

    run(
      () =>
        updateDealProfile({
          deal_id: deal.id,
          business_name: businessName,
          industry_id:
            industryChoice === "" || industryChoice === OTHER_INDUSTRY
              ? null
              : industryChoice,
          industry:
            industryChoice === OTHER_INDUSTRY ? toText(otherIndustry) : null,
          code_name: toText(codeName),
          location_raw: toText(locationRaw),
          employee_band: toText(employeeBand),
          website: toText(website),
          owner_role: toText(ownerRole),
          reason_for_sale: toText(reasonForSale),
          year_established: year === null ? null : Number(year),
        }),
      onSaved,
    );
  }

  return (
    <form onSubmit={onSubmit} className={"flex flex-col gap-5"}>
      <div className={"grid gap-4 sm:grid-cols-2"}>
        <div className={"flex flex-col gap-1.5"}>
          <TextField
            id={"profile-business-name"}
            label={"Business name"}
            value={businessName}
            onChange={setBusinessName}
          />
          {duplicateName ? (
            <p className={"text-warning text-xs"}>
              Another deal in this team already uses this business name.
            </p>
          ) : null}
        </div>
        <TextField
          id={"profile-code-name"}
          label={"Code name"}
          value={codeName}
          onChange={setCodeName}
          hint={
            "Lenders and buyer's counsel see this instead of the business name. 2 to 40 characters; leave empty for none."
          }
        />
      </div>

      <div className={"flex flex-col gap-1.5"}>
        <Label htmlFor={"profile-industry"}>Industry</Label>
        <Select value={industryChoice} onValueChange={setIndustryChoice}>
          <SelectTrigger id={"profile-industry"} className={"w-full sm:w-72"}>
            <SelectValue placeholder={"Pick an industry"} />
          </SelectTrigger>
          <SelectContent>
            {industries.map((industry) => (
              <SelectItem key={industry.id} value={industry.id}>
                {industry.name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_INDUSTRY}>Other</SelectItem>
          </SelectContent>
        </Select>
        {industryChoice === OTHER_INDUSTRY ? (
          <>
            <Label htmlFor={"profile-other-industry"} className={"sr-only"}>
              Other industry
            </Label>
            <Input
              id={"profile-other-industry"}
              required
              value={otherIndustry}
              onChange={(event) => setOtherIndustry(event.target.value)}
            />
          </>
        ) : null}
      </div>

      <div className={"grid gap-4 border-t pt-4 sm:grid-cols-2"}>
        <TextField
          id={"profile-location"}
          label={"Location"}
          value={locationRaw}
          onChange={setLocationRaw}
        />
        <TextField
          id={"profile-year-established"}
          label={"Year established"}
          type={"number"}
          value={yearEstablished}
          onChange={setYearEstablished}
        />
        <TextField
          id={"profile-employee-band"}
          label={"Employee band"}
          value={employeeBand}
          onChange={setEmployeeBand}
        />
        <TextField
          id={"profile-website"}
          label={"Website"}
          value={website}
          onChange={setWebsite}
        />
        <TextField
          id={"profile-owner-role"}
          label={"Owner role"}
          value={ownerRole}
          onChange={setOwnerRole}
        />
        <TextField
          id={"profile-reason-for-sale"}
          label={"Reason for sale"}
          value={reasonForSale}
          onChange={setReasonForSale}
        />
      </div>

      {refusal !== null ? (
        <p role={"alert"} className={"text-destructive text-sm"}>
          {refusal}
        </p>
      ) : null}

      <div className={"flex justify-end"}>
        <Button type={"submit"} disabled={pending}>
          {pending ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

export function DealProfileDialog({
  trigger,
  deal,
  industries,
  otherBusinessNames,
  canManage,
}: {
  trigger: ReactNode;
  deal: ProfileDeal;
  industries: Industry[];
  otherBusinessNames: string[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={"max-h-[90dvh] overflow-y-auto sm:max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>Deal profile</DialogTitle>
          <DialogDescription>
            The business behind this deal. Saving confirms the business name.
          </DialogDescription>
        </DialogHeader>
        <GatedControl allowed={canManage} reason={MANAGERS_ONLY}>
          <DealProfileForm
            deal={deal}
            industries={industries}
            otherBusinessNames={otherBusinessNames}
            onSaved={() => setOpen(false)}
          />
        </GatedControl>
      </DialogContent>
    </Dialog>
  );
}
