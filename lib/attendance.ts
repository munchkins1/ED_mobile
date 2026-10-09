import { supabase } from './supabase';
import { parseQRPayload } from './qr';
import { getEventByCode } from './events';

// --- Types ---

export type AttendanceRecord = {
  id: string; // UUID from Supabase
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    /** Resolved from the `profiles` table; null when unavailable. */
    studentName: string | null;
    /** Fallback display value when no name has been set. */
    studentEmail: string | null;
    scannedAt: string;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

// --- Student Functions ---

/**
 * Validates a scanned QR payload, checks time windows, ensures the event exists in the cloud,
 * and records the student's attendance.
 */
export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  // 1. Validate format using shared QR parser
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }
  const payload = parsed.payload;

  // 2. Check time windows
  const now = Date.now();
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end && now > end) {
    return { success: false, message: 'Event has already ended.' };
  }

  const title = payload.title ?? payload.event;
  let event: { id: string; title: string } | null = null;

  // 3. Find event in cloud via shared getEventByCode helper
  const foundEvent = await getEventByCode(payload.event);
  if (foundEvent) {
    event = foundEvent;
  } else {
    // 3b. Fallback: create the event if it doesn't exist yet (teacher dynamic QR fallback)
    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert([
        {
          event_code: payload.event,
          title,
          start_time: payload.start ?? null,
          end_time: payload.end ?? null,
        },
      ])
      .select('id, title')
      .single();

    if (insertError || !newEvent) {
      return { success: false, message: 'Could not create event.' };
    }
    event = newEvent;
  }

  // 4. Record attendance
  const { error: attError } = await supabase.from('attendance').insert([
    {
      student_id: studentId,
      event_id: event.id,
    },
  ]);

  if (attError) {
    // 5. Handle unique constraint violation (already scanned)
    if (attError.code === '23505') {
      return {
        success: false,
        message: 'Already registered for this event.',
        eventTitle: event.title,
      };
    }
    return { success: false, message: attError.message };
  }

  return { success: true, message: 'Attendance recorded!', eventTitle: event.title };
}

/**
 * Fetches attendance history for a specific student.
 */
export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`
      id,
      scanned_at,
      events (
        event_code,
        title
      )
    `)
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? 'Unknown Event',
    scannedAt: row.scanned_at,
  }));
}

// --- Teacher Functions ---

/**
 * Fetches all events created by a teacher and maps their attendance records.
 */
export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) {
    if (eventError) {
      console.warn('[attendance] could not load teacher events:', eventError.message);
    }
    return [];
  }

  console.log(`[attendance] teacher ${teacherId} has ${events.length} event(s)`);

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  const { data: attendance } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  const attendanceRows = attendance || [];

  // Resolve the names/emails of every student who scanned, in a single query.
  // (Allowed by the "Teachers can view profiles of their attendees" RLS policy.)
  const studentIds = Array.from(
    new Set(attendanceRows.map((a: any) => a.student_id).filter(Boolean))
  );

  const profileById = new Map<string, { name: string | null; email: string | null }>();
  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds);

    (profiles || []).forEach((p: any) => {
      profileById.set(p.id, {
        name: p.full_name ?? null,
        email: p.email ?? null,
      });
    });
  }

  return events.map((e: any) => {
    const rows = attendanceRows.filter((a: any) => a.event_id === e.id);
    return {
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      startTime: e.start_time,
      endTime: e.end_time,
      attendeeCount: rows.length,
      attendees: rows.map((a: any) => {
        const profile = profileById.get(a.student_id);
        return {
          studentId: a.student_id,
          studentName: profile?.name ?? null,
          studentEmail: profile?.email ?? null,
          scannedAt: a.scanned_at,
        };
      }),
    };
  });
}

/**
 * Maps teacher events down to a lightweight summary format with aggregate counts.
 */
export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  const { data: attRows } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  const counts: Record<string, number> = {};
  (attRows || []).forEach((r: any) => {
    counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
  });

  return events.map((e: any) => ({
    eventId: e.id,
    eventCode: e.event_code,
    title: e.title,
    attendeeCount: counts[e.id] ?? 0,
  }));
}