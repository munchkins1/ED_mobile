import { supabase } from '@/lib/supabase';
import type { EventRow, EventStatus, UserRole } from '@/types/database';
import { refusedMessage, verifyPatch } from './verify';

/**
 * Events data layer (spec section 3).
 * Students see only open events, teachers their own, admins all — RLS
 * enforces this server-side too, but the query mirrors the spec.
 */

export type EventInput = {
  name: string;
  description: string | null;
  venue: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  status: EventStatus;
};

export type SaveResult = {
  data: EventRow | null;
  error: string | null;
};

const EVENT_COLUMNS =
  'id, name, description, venue, start_datetime, end_datetime, status, qr_token, created_by, created_at, event_code, title, start_time, end_time';

/** Validates end >= start before touching the database. */
export function validateEventTimes(
  start: string | null,
  end: string | null
): string | null {
  if (start && end) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return 'Invalid date format.';
    }
    if (endMs < startMs) {
      return 'End date must be on or after the start date.';
    }
  }
  return null;
}

/** Lists events visible to the given role (spec listVisibleEvents). */
export async function listVisibleEvents(
  role: UserRole | null,
  userId: string | null
): Promise<EventRow[]> {
  let query = supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .order('start_datetime', { ascending: false, nullsFirst: false });

  if (role === 'student') {
    query = query.eq('status', 'open');
  } else if (role === 'teacher' && userId) {
    query = query.eq('created_by', userId);
  }
  // admin: no extra filter — sees all rows RLS allows.

  const { data, error } = await query;
  if (error) {
    console.warn('[campusqr/events] listVisibleEvents failed:', error.message);
    return [];
  }
  return (data as EventRow[]) ?? [];
}

/** Fetches one event by id (for the form / QR display screens). */
export async function getEventById(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('[campusqr/events] getEventById failed:', error.message);
    return null;
  }
  return data as EventRow | null;
}

/** Creates a new event. Re-reads the inserted row before reporting success. */
export async function saveNewEvent(
  input: EventInput,
  createdBy: string
): Promise<SaveResult> {
  const timeError = validateEventTimes(input.start_datetime, input.end_datetime);
  if (timeError) return { data: null, error: timeError };

  const { data, error } = await supabase
    .from('events')
    .insert({
      name: input.name.trim(),
      description: input.description,
      venue: input.venue,
      start_datetime: input.start_datetime,
      end_datetime: input.end_datetime,
      status: input.status,
      created_by: createdBy,
    })
    .select(EVENT_COLUMNS)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as EventRow, error: null };
}

/** Updates an event and re-reads the row to confirm the change persisted. */
export async function updateEvent(
  id: string,
  input: EventInput
): Promise<SaveResult & { refused?: string[] }> {
  const timeError = validateEventTimes(input.start_datetime, input.end_datetime);
  if (timeError) return { data: null, error: timeError };

  const patch = {
    name: input.name.trim(),
    description: input.description,
    venue: input.venue,
    start_datetime: input.start_datetime,
    end_datetime: input.end_datetime,
    status: input.status,
  };

  const { error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', id);
  if (error) return { data: null, error: error.message };

  // Re-read: an RLS-blocked update affects 0 rows and returns no error.
  const row = await getEventById(id);
  const check = verifyPatch(row as unknown as Record<string, unknown> | null, patch);
  if (!check.ok) {
    return { data: null, error: refusedMessage(check.refused), refused: check.refused };
  }
  return { data: row, error: null };
}

/** Sets draft/open/closed status and verifies the write. */
export async function setEventStatus(
  id: string,
  status: EventStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', id);
  if (error) return { error: error.message };

  const row = await getEventById(id);
  const check = verifyPatch(row as unknown as Record<string, unknown> | null, {
    status,
  });
  if (!check.ok) return { error: refusedMessage(check.refused) };
  return { error: null };
}

/** Deletes an event (owner/admin — RLS enforces server-side). */
export async function deleteEvent(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) return { error: error.message };

  const row = await getEventById(id);
  if (row) return { error: 'The database refused to delete this event.' };
  return { error: null };
}

/** The QR payload for an event: "CAMPUSQR:<qr_token>". */
export function qrPayload(event: EventRow): string {
  return `CAMPUSQR:${event.qr_token}`;
}
