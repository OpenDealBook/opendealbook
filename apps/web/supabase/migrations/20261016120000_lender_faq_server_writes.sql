-- Only server code publishes an FAQ entry or adds an FAQ file.
create or replace function public.lender_faq_entry_maintain()
  returns trigger
  language plpgsql
  set search_path = '' as $$
begin
  if new.status = 'published'
    and (tg_op = 'INSERT' or old.status <> 'published')
    and current_user = 'authenticated' then
    raise exception 'Only server code publishes an FAQ entry'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    new.first_published_at := case when new.status = 'published' then now() end;
  else
    if (new.question, new.answer) is distinct from (old.question, old.answer) then
      if new.version <> old.version then
        raise exception 'FAQ entry % was saved by someone else since version %', old.id, new.version
          using errcode = 'serialization_failure';
      end if;
      new.version := old.version + 1;
      new.updated_at := now();
    else
      new.version := old.version;
    end if;
    new.first_published_at := coalesce(
      old.first_published_at,
      case when new.status = 'published' then now() end
    );
  end if;

  new.search_tsv :=
    setweight(to_tsvector('english', new.question), 'A')
    || setweight(to_tsvector('english', new.answer), 'B');
  return new;
end;
$$;

revoke insert on public.lender_faq_file from authenticated;
drop policy if exists lender_faq_file_insert on public.lender_faq_file;
