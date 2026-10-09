import { supabase } from '@/lib/supabase';
import { getEventByCode } from '@/lib/events';
import type {
  AttendanceRow,
  AttendanceStatus,
  CheckInResult,
} from '@/types/database';
import { suppressEcho } from './realtime';
import { refusedMessage, verifyPatch } from './verify';

/**
 * Attendance data layer (spec section 3).
 *
 * Attendance rows are ONLY created through the check_in() RPC — there is
 * no client-side INSERT anywhere in this module (the database has no
 * INSERT policy for attendance either).
 */

export type OwnAttendanceRecord = {
  id: string;
  status: AttendanceStatus;
  recorded_at: string;
  scanned_at: string | null;
  event: { name: string; start_datetime: string | null } | null;
};

export type EventAttendanceRecord = AttendanceRow & {
  student: {
    full_name: string;
    email: string;
    student_no: string | null;
  } | null;
  event: { name: string } | null;
};

export type RecordFilters = {
  status?: AttendanceStatus | null;
  keyword?: string;
};

// ---------------------------------------------------------------- check-in

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strips the optional CAMPUSQR: prefix and returns the raw token. */
export function stripQrPrefix(raw: string): string {
  const trimmed = raw.trim();
  const match = /^campusqr:(.*)$/i.exec(trimmed);
  return (match ? match[1] : trimmed).trim();
}

/**
 * Resolves whatever the scanner produced into a token suitable for
 * check_in(): accepts "CAMPUSQR:<uuid>", a bare uuid, and — for
 * compatibility with QR codes printed by the pre-existing app — the
 * legacy JSON payload {"v":1,"event":"EVT-..."} (resolved to the event's
 * qr_token via the existing getEventByCode helper; RLS still applies).
 * Returns null when nothing can be resolved (invalid).
 */
export async function resolveScanToken(raw: string): Promise<string | null> {
  const stripped = stripQrPrefix(raw);
  if (UUID_RE.test(stripped)) return stripped;

  // Legacy JSON payload from the pre-existing app?
  try {
    const parsed = JSON.parse(stripped) as { v?: number; event?: string };
    if (parsed && parsed.v === 1 && typeof parsed.event === 'string') {
      // getEventByCode selects '*' — qr_token exists at runtime after the
      // campusqr_schema.sql migration, but the legacy type predates it.
      const legacy = (await getEventByCode(parsed.event)) as {
        qr_token?: string;
      } | null;
      if (legacy?.qr_token) return legacy.qr_token;
      return null;
    }
  } catch {
    // not JSON — fall through
  }

  return null;
}

/**
 * Calls the check_in RPC — the only way to record attendance.
 * Handles all five results (success, duplicate, closed, invalid,
 * unauthorized) and marks the local echo as suppressed on success so the
 * realtime INSERT of our own row is not treated as a remote change.
 */
export async function checkIn(rawScan: string): Promise<CheckInResult> {
  const token = await resolveScanToken(rawScan);
  if (!token) {
    return {
      result: 'invalid',
      message: 'Invalid QR code - no matching event found.',
    };
  }

  const { data, error } = await supabase.rpc('check_in', {
    p_token: token,
  });

  if (error) {
    return {
      result: 'invalid',
      message: `Unable to record attendance: ${error.message}`,
    };
  }

  const result = data as CheckInResult;
  if (result.result === 'success') {
    suppressEcho('attendance');
  }
  return result;
}

// ------------------------------------------------------------ student view

/** The signed-in student's own check-in history. */
export async function fetchOwnHistory(
  studentId: string
): Promise<OwnAttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(
      `id, status, recorded_at, scanned_at,
       event:events ( name, start_datetime )`
    )
    .eq('student_id', studentId)
    .order('recorded_at', { ascending: false });

  if (error) {
    console.warn('[campusqr/attendance] fetchOwnHistory failed:', error.message);
    return [];
  }
  return (data as unknown as OwnAttendanceRecord[]) ?? [];
}

// ------------------------------------------------------------- staff views

/**
 * Records for one event with optional status/keyword filters
 * (fetchEventRecords). Keyword matches student name/email/number and is
 * applied client-side on the already-fetched, RLS-scoped rows.
 */
export async function fetchEventRecords(
  eventId: string,
  filters: RecordFilters = {}
): Promise<EventAttendanceRecord[]> {
  let query = supabase
    .from('attendance')
    .select(
      `id, student_id, event_id, status, method, recorded_at, recorded_by, scanned_at,
       student:student_id ( full_name, email, student_no ),
       event:event_id ( name )`
    )
    .eq('event_id', eventId)
    .order('recorded_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    console.warn(
      '[campusqr/attendance] fetchEventRecords failed:',
      error.message
    );
    return [];
  }

  let rows = (data as unknown as EventAttendanceRecord[]) ?? [];
  const keyword = (filters.keyword ?? '').trim().toLowerCase();
  if (keyword) {
    rows = rows.filter((row) => {
      const hay = [
        row.student?.full_name ?? '',
        row.student?.email ?? '',
        row.student?.student_no ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(keyword);
    });
  }
  return rows;
}

// ------------------------------------------------------------- corrections

/**
 * Updates an attendance status (owner/admin — RLS enforces server-side),
 * then re-reads the row: a silently-blocked update affects 0 rows, so we
 * report exactly which fields the database refused.
 */
export async function updateAttendance(
  id: string,
  status: AttendanceStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .update({ status })
    .eq('id', id);
  if (error) return { error: error.message };

  suppressEcho('attendance', id);

  const { data: row } = await supabase
    .from('attendance')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  const check = verifyPatch(row as Record<string, unknown> | null, { status });
  if (!check.ok) return { error: refusedMessage(check.refused) };
  return { error: null };
}

/** Deletes an attendance row and verifies it is actually gone. */
export async function deleteAttendance(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', id);
  if (error) return { error: error.message };

  suppressEcho('attendance', id);

  const { data: row } = await supabase
    .from('attendance')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (row) return { error: 'The database refused to delete this record.' };
  return { error: null };
}
