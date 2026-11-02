alter table public.document_segment add column formulas text;

drop function public.read_sheet_range(uuid, text, text);

-- Sheet blocks of one sheet that overlap the range, under the same cap as
-- read_document_pages. Formulas come back only when asked for.
create function public.read_sheet_range(document_id uuid, sheet text, a1_range text, with_formulas boolean default false)
  returns table (segment_id uuid, cell_range text, text text, formulas text, from_ocr boolean)
  language sql stable security invoker
  set search_path = '' as $$
  select r.id, r.cell_range, left(r.text, 32000 - r.preceding::int),
         case when read_sheet_range.with_formulas then r.formulas end, r.from_ocr
  from (
    select s.id, s.cell_range, s.text, s.formulas, s.from_ocr, s.segment_index,
           coalesce(sum(length(s.text)) over (order by s.segment_index rows between unbounded preceding and 1 preceding), 0) as preceding
    from public.document_segment s
    where s.dr_document_id = read_sheet_range.document_id
      and s.sheet = read_sheet_range.sheet
      and public.a1_box(s.cell_range) operator(pg_catalog.&&) public.a1_box(read_sheet_range.a1_range)
  ) r
  where r.preceding < 32000
  order by r.segment_index;
$$;

grant execute on function public.read_sheet_range(uuid, text, text, boolean) to authenticated, service_role;
