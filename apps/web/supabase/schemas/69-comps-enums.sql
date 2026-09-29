-- Enums for the Comparables module. data_class is the core RLS invariant: it is
-- set once at insert and frozen by a trigger, and every cross-tenant path
-- excludes proprietary rows. license status drives the proprietary read join;
-- activity confidence tracks how far an anonymized deal was qualified.

create type public.comp_data_class as enum (
  'external',
  'proprietary',
  'internal'
);

create type public.comp_license_status as enum (
  'active',
  'expired',
  'revoked'
);

create type public.activity_confidence as enum (
  'listed',
  'screened',
  'verified'
);
