-- ============================================================
-- Migration v10 — Rider profile / SAR fields
--
-- The profile was just a display name. Riders in events (and anyone
-- an organizer may have to hand to a search-and-rescue crew) need real
-- identity and medical basics. All optional; a rider fills what they
-- want. Run in the Supabase SQL editor after 009. Safe to re-run.
-- ============================================================

alter table public.profiles
  add column if not exists first_name              text,
  add column if not exists last_name               text,
  add column if not exists date_of_birth           date,
  add column if not exists blood_type              text,
  add column if not exists country                 text,
  add column if not exists phone                   text,
  add column if not exists emergency_contact_name  text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relation text;

-- Keep updated_at honest on any profile edit.
create or replace function public.touch_profile_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_profile_updated_at();
