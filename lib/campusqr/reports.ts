import { supabase } from '@/lib/supabase';
import { listVisibleEvents } from './events';
import type {
  AttendanceStatus,
  AuditLogRow,
  UserRole,
} from '@/types/database';

/**
 * Reports data layer (spec section 3): summary counts per event/period/
 * status, CSV building, and the admin System Activity Log.
 */

export type Period = 'all' | 'today' | 'week' | 'month';

export const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
];

export type EventSummary = {
  eventId: string;
  name: string;
  start: string | null;
  total: number;
  counts: Record<AttendanceStatus, number>;
};

export type AuditLogEntry = AuditLogRow & {
  actor: { full_name: string; email: string } | null;
};

function emptyCounts(): Record<AttendanceStatus, number> {
  return { present: 0, late: 0, absent: 0, excused: 0 };
}

function periodCutoff(period: Period): number | null {
  const now = new Date();
  switch (period) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.getTime();
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return start.getTime();
    }
    case 'month': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return start.getTime();
    }
    default:
      return null;
  }
}

/**
 * Attendance counts per event for the given role scope
 * (students: own — used only for stats; staff: their events / all).
 */
export async function fetchSummaries(
  role: UserRole | null,
  userId: string | null,
  period: Period = 'all'
): Promise<EventSummary[]> {
  const events = await listVisibleEvents(role, userId);
  const ids = events.map((event) => event.id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('attendance')
    .select('event_id, status, recorded_at')
    .in('event_id', ids);

  if (error) {
    console.warn('[campusqr/reports] fetchSummaries failed:', error.message);
    return [];
  }

  const cutoff = periodCutoff(period);
  const rows = ((data ?? []) as {
    event_id: string;
    status: AttendanceStatus;
    recorded_at: string;
  }[]).filter((row) => {
    if (cutoff === null) return true;
    const ts = new Date(row.recorded_at).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  const byEvent = new Map<string, EventSummary>();
  for (const event of events) {
    byEvent.set(event.id, {
      eventId: event.id,
      name: event.name,
      start: event.start_datetime,
      total: 0,
      counts: emptyCounts(),
    });
  }

  for (const row of rows) {
    const summary = byEvent.get(row.event_id);
    if (!summary) continue;
    summary.total += 1;
    if (summary.counts[row.status] !== undefined) {
      summary.counts[row.status] += 1;
    }
  }

  return Array.from(byEvent.values());
}

/** Builds a CSV export of the summaries (shared via the RN Share sheet). */
export function summariesToCsv(summaries: EventSummary[]): string {
  const escape = (value: string | number): string => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = [
    'Event',
    'Start',
    'Present',
    'Late',
    'Absent',
    'Excused',
    'Total',
  ];
  const lines = [header.join(',')];

  for (const summary of summaries) {
    lines.push(
      [
        escape(summary.name),
        escape(summary.start ?? ''),
        summary.counts.present,
        summary.counts.late,
        summary.counts.absent,
        summary.counts.excused,
        summary.total,
      ].join(',')
    );
  }

  return lines.join('\n');
}

/** Admin-only System Activity Log (audit_logs; RLS enforces admin). */
export async function fetchAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select(
      `id, actor_id, action, entity, entity_id, details, created_at,
       actor:actor_id ( full_name, email )`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[campusqr/reports] fetchAuditLog failed:', error.message);
    return [];
  }
  return (data as unknown as AuditLogEntry[]) ?? [];
}
