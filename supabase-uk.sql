-- MK Finances: allow the "UK Online Shop & Market Stall" business type.
-- Only needed if choosing that business type shows a database error.
-- Supabase → SQL Editor → paste → Run. Safe to run more than once; no data is changed.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'business' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%business_type%'
  loop
    execute format('alter table public.business drop constraint %I', c.conname);
  end loop;
  alter table public.business add constraint business_business_type_check
    check (business_type is null or business_type in ('manufacturer', 'trader', 'importer', 'investor', 'retail_uk'));
end $$;
