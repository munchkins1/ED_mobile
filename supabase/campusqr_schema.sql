-- ============================================================
-- CampusQR schema upgrade — NEW additive migration file.
-- (phase3_schema.sql is NOT modified; this file runs AFTER it.)
--
-- WHAT IT DOES
--   Upgrades the existing QR-ATT database in place to the CampusQR data
--   model from transfer.md: enums, educational profile columns, event
--   status + qr_token, attendance status columns, audit_logs, the
--   check_in() RPC, admin RPCs, triggers and the full RLS policy set.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Idempotent: safe to re-run.
--
-- COMPATIBILITY GUARANTEES
--   * No legacy column is dropped (title, event_code, start_time,
--     end_time, scanned_at, updated_at remain so the pre-existing app
--     keeps working). A sync trigger keeps legacy and CampusQR columns
--     consistent in both directions.
--   * Existing rows are backfilled (name<-title, start_datetime<-
--     start_time, qr_token generated, legacy events opened/closed).
-- ============================================================

-- ------------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('student', 'teacher', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.event_status as enum ('draft', 'open', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.educational_level as enum ('college', 'senior_high', 'junior_high', 'elementary');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------------
-- 2. profiles — educational/personal columns, is_active, role enum, email
-- ------------------------------------------------------------------
alter table public.profiles add column if not exists student_no text;
alter table public.profiles add column if not exists grade_class text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists title text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists educational_level public.educational_level;
alter table public.profiles add column if not exists course text;
alter table public.profiles add column if not exists year_level text;
alter table public.profiles add column if not exists block text;
alter table public.profiles add column if not exists section text;

update public.profiles set full_name = coalesce(full_name, '') where full_name is null;
alter table public.profiles alter column full_name set default '';
alter table public.profiles alter column full_name set not null;

-- email: not null + unique (backfill from auth.users first; tolerate bad
-- legacy data with a notice instead of aborting the whole migration)
do $$ begin
  update public.profiles p
     set email = u.email
    from auth.users u
   where u.id = p.id and (p.email is null or p.email = '');
  alter table public.profiles alter column email set not null;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass and conname = 'profiles_email_key'
  ) then
    alter table public.profiles add constraint profiles_email_key unique (email);
  end if;
exception when others then
  raise notice 'profiles email not-null/unique skipped: %', sqlerrm;
end $$;

-- role: text (student|teacher) -> user_role enum (adds 'admin')
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'role' and data_type = 'text'
  ) then
    alter table public.profiles
      alter column role type public.user_role using (role::public.user_role);
  end if;

  alter table public.profiles alter column role set default 'student'::public.user_role;
  alter table public.profiles alter column role set not null;
end $$;

-- ------------------------------------------------------------------
-- 3. events — CampusQR columns, backfill, qr_token, CHECK, FK -> profiles
-- ------------------------------------------------------------------
alter table public.events add column if not exists name text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists start_datetime timestamptz;
alter table public.events add column if not exists end_datetime timestamptz;
alter table public.events add column if not exists status public.event_status not null default 'draft';
alter table public.events add column if not exists qr_token uuid;

-- backfill legacy rows
update public.events
   set name = coalesce(nullif(name, ''), title, 'Untitled event')
 where name is null or name = '';
update public.events set start_datetime = coalesce(start_datetime, start_time)
 where start_datetime is null and start_time is not null;
update public.events set end_datetime = coalesce(end_datetime, end_time)
 where end_datetime is null and end_time is not null;
update public.events set qr_token = gen_random_uuid() where qr_token is null;
-- legacy rows (event_code is never set by CampusQR code) become open/closed;
-- genuine CampusQR drafts have event_code null and stay untouched on re-run
update public.events
   set status = case
         when end_datetime is not null and end_datetime < now() then 'closed'::public.event_status
         else 'open'::public.event_status
       end
 where status = 'draft' and event_code is not null;

alter table public.events alter column name set not null;
alter table public.events alter column qr_token set not null;
create unique index if not exists events_qr_token_key on public.events (qr_token);

-- end >= start (NOT VALID: legacy rows exempt, new/updated rows enforced)
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events'::regclass and conname = 'events_time_window'
  ) then
    alter table public.events
      add constraint events_time_window check (end_datetime >= start_datetime) not valid;
  end if;
end $$;

-- created_by: auth.users -> profiles (keeps ON DELETE SET NULL behaviour)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.events'::regclass
       and contype = 'f'
       and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.events drop constraint %I', c.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events'::regclass
       and contype = 'f'
       and confrelid = 'public.profiles'::regclass
  ) then
    alter table public.events
      add constraint events_created_by_fkey
      foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
end $$;

-- ------------------------------------------------------------------
-- 4. attendance — status columns, backfill, FK -> profiles, indexes
-- ------------------------------------------------------------------
alter table public.attendance add column if not exists status public.attendance_status not null default 'present';
alter table public.attendance add column if not exists method text;
alter table public.attendance add column if not exists recorded_at timestamptz;
alter table public.attendance add column if not exists recorded_by uuid;

update public.attendance set recorded_at = coalesce(recorded_at, scanned_at)
 where recorded_at is null;
update public.attendance set method = coalesce(method, 'qr') where method is null;
alter table public.attendance alter column recorded_at set default now();
alter table public.attendance alter column method set default 'qr';

-- student_id: auth.users -> profiles (keeps ON DELETE CASCADE)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.attendance'::regclass
       and contype = 'f'
       and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.attendance drop constraint %I', c.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.attendance'::regclass
       and contype = 'f'
       and confrelid = 'public.profiles'::regclass
       and pg_get_constraintdef(oid) like '%student_id%'
  ) then
    alter table public.attendance
      add constraint attendance_student_id_fkey
      foreign key (student_id) references public.profiles (id) on delete cascade;
  end if;
end $$;

-- recorded_by -> profiles
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.attendance'::regclass
       and contype = 'f'
       and conname = 'attendance_recorded_by_fkey'
  ) then
    alter table public.attendance
      add constraint attendance_recorded_by_fkey
      foreign key (recorded_by) references public.profiles (id) on delete set null;
  end if;
end $$;

create index if not exists attendance_event_id_idx on public.attendance (event_id);
create index if not exists attendance_student_id_idx on public.attendance (student_id);
create index if not exists events_status_idx on public.events (status);
create index if not exists events_created_by_idx on public.events (created_by);

-- ------------------------------------------------------------------
-- 5. audit_logs (admin read-only; rows come from triggers/RPCs)
-- ------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 6. HELPER FUNCTIONS (SECURITY DEFINER — recursion-safe)
-- ------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('teacher', 'admin')
  );
$$;

create or replace function public.is_student()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'student'
  );
$$;

-- current_app_role(): named instead of current_role() because CURRENT_ROLE
-- is a reserved SQL keyword in PostgreSQL.
create or replace function public.current_app_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Safe enum cast: returns NULL instead of raising on bad input.
create or replace function public.try_education_level(p text)
returns public.educational_level
language plpgsql
immutable
as $$
begin
  return nullif(trim(coalesce(p, '')), '')::public.educational_level;
exception when invalid_text_representation then
  return null;
end;
$$;

-- True when the caller has an attendance row for the event (used inside the
-- events SELECT policy without re-entering attendance RLS).
create or replace function public.has_attended(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.attendance
    where event_id = p_event_id and student_id = auth.uid()
  );
$$;

-- True when the caller owns the event (used inside attendance policies
-- without re-entering events RLS).
create or replace function public.owns_event(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.events
    where id = p_event_id and created_by = auth.uid()
  );
$$;

-- ------------------------------------------------------------------
-- 7. check_in(p_token) — the ONLY way to create an attendance row
-- ------------------------------------------------------------------
create or replace function public.check_in(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_event public.events%rowtype;
  v_token uuid;
begin
  -- 1. signed in?
  if v_uid is null then
    return jsonb_build_object(
      'result', 'unauthorized',
      'message', 'Only active student accounts can record attendance.'
    );
  end if;

  -- 2. active student?
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.role <> 'student' or v_profile.is_active is not true then
    return jsonb_build_object(
      'result', 'unauthorized',
      'message', 'Only active student accounts can record attendance.'
    );
  end if;

  -- 3. valid UUID token?
  begin
    v_token := trim(coalesce(p_token, ''))::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object(
      'result', 'invalid',
      'message', 'Invalid QR code - no matching event found.'
    );
  end;

  -- 4. matching event?
  select * into v_event from public.events where qr_token = v_token;
  if not found then
    return jsonb_build_object(
      'result', 'invalid',
      'message', 'Invalid QR code - no matching event found.'
    );
  end if;

  -- 5. event open and not ended?
  if v_event.status <> 'open'
     or (v_event.end_datetime is not null and v_event.end_datetime < now()) then
    return jsonb_build_object(
      'result', 'closed',
      'message', 'This event is closed for attendance.',
      'event_name', v_event.name
    );
  end if;

  -- 6. duplicate?
  if exists (
    select 1 from public.attendance
    where event_id = v_event.id and student_id = v_uid
  ) then
    return jsonb_build_object(
      'result', 'duplicate',
      'message', 'You have already checked in to this event.',
      'event_name', v_event.name
    );
  end if;

  -- 7. insert + audit
  insert into public.attendance (student_id, event_id, status, method, recorded_by)
  values (v_uid, v_event.id, 'present', 'qr', v_uid);

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (
    v_uid,
    'check_in',
    'attendance',
    null,
    jsonb_build_object('event_id', v_event.id, 'event_name', v_event.name)
  );

  return jsonb_build_object(
    'result', 'success',
    'message', 'Attendance recorded successfully.',
    'event_name', v_event.name
  );
end;
$$;

grant execute on function public.check_in(text) to authenticated;

-- ------------------------------------------------------------------
-- 8. ADMIN RPCs (admin only)
-- ------------------------------------------------------------------
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if not public.is_admin() then
    return jsonb_build_object('result', 'error', 'message', 'Administrator access required.');
  end if;

  begin
    v_role := lower(trim(coalesce(p_role, '')))::public.user_role;
  exception when invalid_text_representation then
    return jsonb_build_object('result', 'error', 'message', 'Invalid role value.');
  end;

  -- Admins cannot remove their own admin role.
  if p_user_id = auth.uid() and v_role <> 'admin' then
    return jsonb_build_object(
      'result', 'error',
      'message', 'You cannot remove your own admin role.'
    );
  end if;

  update public.profiles set role = v_role where id = p_user_id;
  if not found then
    return jsonb_build_object('result', 'error', 'message', 'User not found.');
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'admin_set_role', 'profiles', p_user_id::text,
          jsonb_build_object('role', v_role));

  return jsonb_build_object('result', 'success', 'message', 'Role updated.', 'role', v_role);
end;
$$;

create or replace function public.admin_set_active(p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('result', 'error', 'message', 'Administrator access required.');
  end if;

  -- Admins cannot deactivate themselves.
  if p_user_id = auth.uid() and p_active is distinct from true then
    return jsonb_build_object(
      'result', 'error',
      'message', 'You cannot deactivate your own account.'
    );
  end if;

  update public.profiles set is_active = p_active where id = p_user_id;
  if not found then
    return jsonb_build_object('result', 'error', 'message', 'User not found.');
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'admin_set_active', 'profiles', p_user_id::text,
          jsonb_build_object('is_active', p_active));

  return jsonb_build_object('result', 'success', 'message', 'Account status updated.');
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('result', 'error', 'message', 'Administrator access required.');
  end if;

  if p_user_id = auth.uid() then
    return jsonb_build_object(
      'result', 'error',
      'message', 'You cannot delete your own account.'
    );
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('result', 'error', 'message', 'User not found.');
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'admin_delete_user', 'profiles', p_user_id::text, '{}'::jsonb);

  -- Cascades: auth.users -> profiles (on delete cascade) -> attendance.
  delete from auth.users where id = p_user_id;
  if not found then
    return jsonb_build_object('result', 'error', 'message', 'User could not be deleted.');
  end if;

  return jsonb_build_object('result', 'success', 'message', 'User deleted.');
end;
$$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 9. TRIGGERS
-- ------------------------------------------------------------------
-- handle_new_user(): public signups ALWAYS create a student. Role and
-- is_active are never read from signup metadata (the DB hardcodes them).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, full_name, phone, student_no, educational_level,
    course, year_level, block, section, role, is_active
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'student_no',
    public.try_education_level(new.raw_user_meta_data->>'educational_level'),
    new.raw_user_meta_data->>'course',
    new.raw_user_meta_data->>'year_level',
    new.raw_user_meta_data->>'block',
    new.raw_user_meta_data->>'section',
    'student',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- trg_protect_profile_fields: non-admins cannot change role or is_active.
create or replace function public.trg_protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Only administrators can change roles.';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'Only administrators can change account activation.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before update on public.profiles
  for each row execute function public.trg_protect_profile_fields();

-- trg_audit_events: audit trail for event insert / update / status change.
create or replace function public.trg_audit_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'insert', 'events', new.id::text,
            jsonb_build_object('name', new.name, 'status', new.status));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    insert into public.audit_logs (actor_id, action, entity, entity_id, details)
    values (auth.uid(), 'update', 'events', new.id::text,
            jsonb_build_object('name', new.name, 'status', new.status));
    if new.status is distinct from old.status then
      insert into public.audit_logs (actor_id, action, entity, entity_id, details)
      values (auth.uid(), 'status_change', 'events', new.id::text,
              jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_events on public.events;
create trigger trg_audit_events
  after insert or update on public.events
  for each row execute function public.trg_audit_events();

-- ------------------------------------------------------------------
-- 10. LEGACY <-> CampusQR COLUMN SYNC
--     The pre-existing app writes title/start_time/end_time; CampusQR
--     writes name/start_datetime/end_datetime. This trigger mirrors
--     whichever side changed so both apps always see consistent data.
-- ------------------------------------------------------------------
create or replace function public.sync_event_columns()
returns trigger
language plpgsql
as $$
begin
  -- On INSERT there is no OLD row: just fill whichever side is missing.
  if tg_op = 'INSERT' then
    if (new.name is null or new.name = '') and new.title is not null then
      new.name := new.title;
    end if;
    if (new.title is null or new.title = '') and new.name is not null then
      new.title := new.name;
    end if;
    if new.start_datetime is null and new.start_time is not null then
      new.start_datetime := new.start_time;
    end if;
    if new.start_time is null and new.start_datetime is not null then
      new.start_time := new.start_datetime;
    end if;
    if new.end_datetime is null and new.end_time is not null then
      new.end_datetime := new.end_time;
    end if;
    if new.end_time is null and new.end_datetime is not null then
      new.end_time := new.end_datetime;
    end if;
    return new;
  end if;

  -- On UPDATE: mirror whichever side the caller changed.
  if new.name is distinct from old.name then
    if new.name is not null and new.name <> '' then
      new.title := new.name;
    end if;
  elsif new.title is distinct from old.title then
    if new.title is not null and new.title <> '' then
      new.name := new.title;
    end if;
  end if;

  if new.start_datetime is distinct from old.start_datetime then
    new.start_time := new.start_datetime;
  elsif new.start_time is distinct from old.start_time then
    new.start_datetime := new.start_time;
  end if;

  if new.end_datetime is distinct from old.end_datetime then
    new.end_time := new.end_datetime;
  elsif new.end_time is distinct from old.end_time then
    new.end_datetime := new.end_time;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_event_columns on public.events;
create trigger trg_sync_event_columns
  before insert or update on public.events
  for each row execute function public.sync_event_columns();

-- ------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY — drop every existing policy, rebuild per spec
-- ------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles', 'events', 'attendance', 'audit_logs')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: SELECT own row and (staff) any row; UPDATE own row or admin;
-- INSERT own row (role must be the default 'student'); DELETE admin only.
create policy "Profiles: read own or staff"
  on public.profiles for select
  using (auth.uid() = id or public.is_staff());

create policy "Profiles: insert own student row"
  on public.profiles for insert
  with check (auth.uid() = id and role = 'student');

create policy "Profiles: update own or admin"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

create policy "Profiles: delete admin"
  on public.profiles for delete
  using (public.is_admin());

-- events: SELECT open events + own events + attended events (admins: all);
-- INSERT only as staff with created_by = auth.uid(); UPDATE/DELETE owner or admin.
create policy "Events: read open, own, or attended"
  on public.events for select
  using (
    status = 'open'
    or created_by = auth.uid()
    or public.has_attended(id)
    or public.is_admin()
  );

create policy "Events: insert staff own"
  on public.events for insert
  with check (public.is_staff() and created_by = auth.uid());

create policy "Events: update owner or admin"
  on public.events for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy "Events: delete owner or admin"
  on public.events for delete
  using (created_by = auth.uid() or public.is_admin());

-- attendance: SELECT own rows / rows of events you own / all (admin);
-- UPDATE and DELETE event owner or admin; deliberately NO INSERT policy —
-- rows are only created through check_in().
create policy "Attendance: read own, own-event, or admin"
  on public.attendance for select
  using (
    student_id = auth.uid()
    or public.owns_event(event_id)
    or public.is_admin()
  );

create policy "Attendance: update event owner or admin"
  on public.attendance for update
  using (public.owns_event(event_id) or public.is_admin())
  with check (public.owns_event(event_id) or public.is_admin());

create policy "Attendance: delete event owner or admin"
  on public.attendance for delete
  using (public.owns_event(event_id) or public.is_admin());

-- audit_logs: SELECT admin only; no INSERT/UPDATE/DELETE policies —
-- rows are written by triggers and SECURITY DEFINER functions.
create policy "Audit logs: admin read only"
  on public.audit_logs for select
  using (public.is_admin());

-- ------------------------------------------------------------------
-- 12. COLUMN-LEVEL GRANTS ON profiles
--     Authenticated users may UPDATE exactly these eleven columns:
--     full_name, phone, student_no, grade_class, department, title,
--     educational_level, course, year_level, block, section.
--     Never role, is_active, email or id (admin RPCs handle those).
-- ------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;
grant update (
  full_name, phone, student_no, grade_class, department, title,
  educational_level, course, year_level, block, section
) on public.profiles to authenticated;

-- ------------------------------------------------------------------
-- 13. REALTIME — publish the tables CampusQR subscribes to
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['events', 'attendance', 'profiles', 'audit_logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object or undefined_object then
        raise notice 'realtime publication: could not add % (%)', t, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 14. EXECUTE GRANTS for policy helper functions
-- ------------------------------------------------------------------
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_student() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.try_education_level(text) to authenticated;
grant execute on function public.has_attended(uuid) to authenticated;
grant execute on function public.owns_event(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 15. VERIFICATION
-- ------------------------------------------------------------------
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'events', 'attendance', 'audit_logs')
order by tablename, policyname;

select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('check_in', 'admin_set_role', 'admin_set_active',
                  'admin_delete_user', 'is_admin', 'is_staff', 'is_student',
                  'try_education_level', 'has_attended', 'owns_event')
order by proname;

-- ------------------------------------------------------------------
-- BOOTSTRAP YOUR FIRST ADMIN (run once, after this file)
-- SQL Editor runs as the table owner, so the protect trigger allows it:
--   update public.profiles
--      set role = 'admin'
--    where email = 'your.admin@school.edu';
-- Admins are later promoted/demoted from the Manage Users screen via
-- admin_set_role(); public signups always create students.
-- ------------------------------------------------------------------

