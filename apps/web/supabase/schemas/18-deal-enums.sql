-- Enums for the OpenDealbook deal domain.

-- The single checklist status used everywhere a checklist item has a state.
create type public.checklist_status as enum (
  'not_started',
  'requested',
  'received',
  'reviewed'
);

create type public.deal_source as enum (
  'manual',
  'broker',
  'outreach',
  'marketplace',
  'referral'
);

create type public.participant_party as enum (
  'buyer',
  'seller',
  'broker',
  'lender'
);

create type public.participant_scope as enum (
  'deal',
  'contract',
  'data_room_folder',
  'checklist'
);

create type public.participant_permission as enum (
  'view',
  'comment',
  'suggest',
  'edit',
  'sign'
);

create type public.approval_subject as enum (
  'stage_move',
  'loi',
  'apa',
  'schedule',
  'participant_change'
);

create type public.approval_decision as enum (
  'approved',
  'declined'
);

create type public.checklist_outcome as enum (
  'accepted',
  'follow_up',
  'rejected'
);
