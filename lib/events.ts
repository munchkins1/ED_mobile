import { supabase } from '@/lib/supabase'; // Adjust this import path if your supabase client is located elsewhere

// --- Types ---

export type Event = {
  eventId: string;   // the public event code (from the UI, e.g. EVT-2026-0002)
  title: string;
  start: string;
  end: string;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};

// --- Functions ---

/**
 * Creates or updates an event in the database using its event_code as the conflict key.
 */
export async function createEvent(
  event: Event,
  createdBy?: string | null
): Promise<{ error: string | null }> {
  // Prefer the id handed in by the caller (the signed-in user from the auth
  // store); fall back to asking Supabase directly. Without a real owner the
  // event would never show up in the teacher's event list.
  let ownerId = createdBy ?? null;

  if (!ownerId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    ownerId = user?.id ?? null;
  }

  if (!ownerId) {
    return { error: 'You must be signed in to create an event.' };
  }

  const { error } = await supabase.from('events').upsert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start || null,
      end_time: event.end || null,
      created_by: ownerId,
    },
    { onConflict: 'event_code' }
  );

  return { error: error?.message ?? null };
}

/**
 * Fetches all events created by a specific teacher, newest first.
 */
export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}

/**
 * Looks up a single event by its public event code.
 */
export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}