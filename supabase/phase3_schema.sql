-- ============================================================
-- Phase 3 (FIXED) — Supabase PostgreSQL Schema for QR-ATT
--
-- This is YOUR Phase 3 schema with the RLS recursion fix integrated.
--
-- WHY THIS FIX IS NEEDED
--   The deployed database currently returns:
--     "42P17 infinite recursion detected in policy for relation ..."
--   for profiles / events / attendance. That happens when a policy reads the
--   same table (directly, or through another table's policy that reads it
--   back). When it errors, the app cannot read or write the profile row, so:
--     * the role always shows as "Student", and
--     * the name never saves / the Teacher tab stays locked.
--   Leftover policies from earlier runs caused this. Section 4 below drops
--   EVERY policy on the three tables and rebuilds clean, non-recursive ones,
--   so a student cannot unlock the Teacher tab while a teacher can, and the
--   profile reflects the true role.
--
-- Idempotent: safe to run multiple times.
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE CREATIONS
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);

-- Guarantee the columns the app expects exist even on pre-existing tables ---
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'student';
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.events add column if not exists start_time timestamptz;
alter table public.events add column if not exists end_time timestamptz;
alter table public.events add column if not exists created_by uuid;
alter table public.events add column if not exists created_at timestamptz default now();

alter table public.attendance add column if not exists student_id uuid;
alter table public.attendance add column if not exists event_id uuid;
alter table public.attendance add column if not exists scanned_at timestamptz default now();

-- Unique keys the app relies on (event upsert + "already scanned" detection).
-- Names match Postgres' defaults for the inline constraints above, so these are
-- no-ops on a fresh table and only fill the gap on a pre-existing one.
create unique index if not exists events_event_code_key
  on public.events (event_code);
create unique index if not exists attendance_student_id_event_id_key
  on public.attendance (student_id, event_id);

-- Enforce the allowed role values on pre-existing tables too ----------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('student', 'teacher'));
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. HELPER FUNCTIONS (SECURITY DEFINER — recursion-safe)
-- ------------------------------------------------------------
-- Reading the caller's role through a function avoids the classic
-- "query profiles inside a profiles policy" recursion.
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select "role" from public.profiles where id = auth.uid();
$$;

create or replace function public.is_teacher()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and "role" = 'teacher'
  );
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_teacher() to authenticated;

-- ------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

-- ------------------------------------------------------------
-- 4. DROP EVERY EXISTING POLICY (clears leftover recursive ones)
--    This is the key step that removes the 42P17 recursion.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'events', 'attendance')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. PROFILES POLICIES
-- ------------------------------------------------------------
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Teachers can read profiles of students who attended their events.
-- NOTE: this reads attendance + events only (never profiles), so it cannot
-- create a recursion cycle.
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 6. EVENTS POLICIES
-- ------------------------------------------------------------
create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.role() = 'authenticated');

-- Inserting an event with created_by = NULL is allowed so the app's scan
-- fallback (creating an event on the fly when a QR code isn't in the DB yet)
-- keeps working. A teacher-created event still has created_by = auth.uid().
create policy "Users can insert events"
  on public.events for insert
  with check (
    auth.role() = 'authenticated'
    and (created_by is null or auth.uid() = created_by)
  );

create policy "Users can update their own events"
  on public.events for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- ------------------------------------------------------------
-- 7. ATTENDANCE POLICIES
-- ------------------------------------------------------------
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (auth.uid() = student_id);

create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 8. updated_at AUTO-UPDATE
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 9. AUTOMATIC PROFILE CREATION TRIGGER WITH METADATA EXTRACT
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case
      when new.raw_user_meta_data->>'role' = 'teacher' then 'teacher'
      else 'student'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 10. VERIFICATION
--     Lists the non-recursive policies now in place. After running this
--     script the role reflects correctly (student vs teacher) and the
--     Teacher tab unlocks only for teacher accounts.
-- ------------------------------------------------------------
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'events', 'attendance')
order by tablename, policyname;