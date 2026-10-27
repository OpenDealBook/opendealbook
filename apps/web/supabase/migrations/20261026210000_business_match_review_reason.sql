create type public.match_review_reason as enum ('weak_match', 'ein_conflict');

alter table public.business_match_review
  add column reason public.match_review_reason not null default 'weak_match',
  drop constraint business_match_review_score_check,
  add constraint business_match_review_score_check check (
    case reason
      when 'weak_match' then score >= 0.6 and score < 0.9
      when 'ein_conflict' then score >= 0.9
    end
  );
