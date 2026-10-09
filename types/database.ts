/**
 * CampusQR database types.
 *
 * Mirrors the Supabase schema defined in supabase/campusqr_schema.sql:
 * tables, enums, and the check_in / admin_* RPC signatures and result
 * unions. These types are additive — the existing app does not use them.
 */

// ---------------------------------------------------------------- enums

export type UserRole = 'student' | 'teacher' | 'admin';
export type EventStatus = 'draft' | 'open' | 'closed';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type EducationalLevel =
  | 'college'
  | 'senior_high'
  | 'junior_high'
  | 'elementary';

// ---------------------------------------------------------------- tables

/** public.profiles — 1:1 with auth.users. */
export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  student_no: string | null;
  grade_class: string | null;
  department: string | null;
  title: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  educational_level: EducationalLevel | null;
  course: string | null;
  year_level: string | null;
  block: string | null;
  section: string | null;
  /** Legacy column kept for the pre-existing app. */
  updated_at?: string | null;
};

/**
 * The eleven profile columns a user may update on their own row
 * (column-level grants). Never role, is_active, email or id.
 */
export const SELF_EDITABLE_PROFILE_COLUMNS = [
  'full_name',
  'phone',
  'student_no',
  'grade_class',
  'department',
  'title',
  'educational_level',
  'course',
  'year_level',
  'block',
  'section',
] as const;

export type SelfEditableProfileColumn =
  (typeof SELF_EDITABLE_PROFILE_COLUMNS)[number];

/** Self-service profile patch — restricted to the eleven editable columns. */
export type ProfilePatch = Partial<
  Pick<Profile, SelfEditableProfileColumn>
> & {
  /** '' is accepted from forms and normalized to null for enum columns. */
  educational_level?: EducationalLevel | null;
};

/** public.events — CampusQR columns (legacy columns marked optional). */
export type EventRow = {
  id: string;
  name: string;
  description: string | null;
  venue: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  status: EventStatus;
  qr_token: string;
  created_by: string | null;
  created_at: string;
  /** Legacy columns (pre-existing app) — never written by CampusQR code. */
  event_code?: string | null;
  title?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

/** public.attendance — rows are only created through check_in(). */
export type AttendanceRow = {
  id: string;
  student_id: string;
  event_id: string;
  status: AttendanceStatus;
  method: string | null;
  recorded_at: string;
  recorded_by: string | null;
  /** Legacy column (pre-existing app). */
  scanned_at?: string | null;
};

/** public.audit_logs — admin read-only; written by triggers/RPCs. */
export type AuditLogRow = {
  id: number;
  actor_id: string | null;
  action: string | null;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

// ------------------------------------------------------------ RPC results

/** check_in(p_token) — the five possible results. */
export type CheckInResultType =
  | 'success'
  | 'duplicate'
  | 'closed'
  | 'invalid'
  | 'unauthorized';

export type CheckInArgs = {
  p_token: string;
};

export type CheckInResult = {
  result: CheckInResultType;
  message: string;
  event_name?: string;
  event_id?: string;
};

/** admin_set_role(p_user_id, p_role). */
export type AdminSetRoleArgs = {
  p_user_id: string;
  p_role: string;
};

/** admin_set_active(p_user_id, p_active). */
export type AdminSetActiveArgs = {
  p_user_id: string;
  p_active: boolean;
};

/** admin_delete_user(p_user_id). */
export type AdminDeleteUserArgs = {
  p_user_id: string;
};

/** Shared envelope of the admin RPCs. */
export type AdminRpcResult = {
  result: 'success' | 'error';
  message: string;
  role?: UserRole;
};

// --------------------------------------------------------- realtime types

export type RealtimeTable = 'events' | 'attendance' | 'profiles' | 'audit_logs';

export type RealtimeChange = {
  table: RealtimeTable;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export type RealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED';
