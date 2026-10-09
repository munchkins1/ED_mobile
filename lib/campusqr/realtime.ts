import { useCallback, useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type {
  RealtimeChange,
  RealtimeStatus,
  RealtimeTable,
} from '@/types/database';

/**
 * One shared realtime channel for events, attendance, profiles and
 * audit_logs (spec section 3), with echo suppression: right after a local
 * mutation we ignore the matching remote event for a short window so a
 * just-deleted row is not "resurrected" by an out-of-order event.
 */

type ChangeListener = (change: RealtimeChange) => void;
type StatusListener = (status: RealtimeStatus) => void;

const TABLES: RealtimeTable[] = [
  'events',
  'attendance',
  'profiles',
  'audit_logs',
];

const ECHO_WINDOW_MS = 5000;

const changeListeners = new Set<ChangeListener>();
const statusListeners = new Set<StatusListener>();

/** table:id -> expiry (epoch ms). table:* -> whole-table wildcard. */
const suppressed = new Map<string, number>();

function pruneSuppressed(now: number) {
  for (const [key, expiry] of suppressed) {
    if (expiry <= now) suppressed.delete(key);
  }
}

/** Marks a just-performed local mutation as "ignore the realtime echo". */
export function suppressEcho(table: RealtimeTable, id?: string): void {
  const now = Date.now();
  pruneSuppressed(now);
  suppressed.set(id ? `${table}:${id}` : `${table}:*`, now + ECHO_WINDOW_MS);
}

function isSuppressed(table: RealtimeTable, id?: string): boolean {
  const now = Date.now();
  pruneSuppressed(now);

  const wildcard = suppressed.get(`${table}:*`);
  if (wildcard && wildcard > now) return true;

  if (id) {
    const specific = suppressed.get(`${table}:${id}`);
    if (specific && specific > now) return true;
    return false;
  }

  // Unknown id (a DELETE echo with default replica identity carries no
  // old row): if we just mutated this table locally, this is our echo.
  for (const key of suppressed.keys()) {
    if (key.startsWith(`${table}:`) && key !== `${table}:*`) return true;
  }
  return false;
}

let channel: RealtimeChannel | null = null;
let subscribedOnce = false;

function startRealtime(): void {
  if (channel) return;

  const ch = supabase.channel('campusqr-realtime');

  for (const table of TABLES) {
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        const eventType = payload.eventType as RealtimeChange['eventType'];
        const newRecord =
          eventType === 'DELETE'
            ? null
            : ((payload.new as Record<string, unknown>) ?? null);
        const oldRecord =
          eventType === 'INSERT'
            ? null
            : ((payload.old as Record<string, unknown>) ?? null);

        const id =
          (typeof newRecord?.id === 'string' && newRecord.id) ||
          (typeof oldRecord?.id === 'string' && oldRecord.id) ||
          undefined;

        if (isSuppressed(table, id)) return;

        const change: RealtimeChange = {
          table,
          eventType,
          new: newRecord,
          old: oldRecord,
        };
        changeListeners.forEach((listener) => listener(change));
      }
    );
  }

  ch.subscribe((status) => {
    statusListeners.forEach((listener) =>
      listener(status as RealtimeStatus)
    );
  });

  channel = ch;
  subscribedOnce = true;
}

/** Subscribes to shared-channel change events. Returns an unsubscribe fn. */
export function onCampusChange(listener: ChangeListener): () => void {
  startRealtime();
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/** Subscribes to shared-channel status. Returns an unsubscribe fn. */
export function onCampusStatus(listener: StatusListener): () => void {
  startRealtime();
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/**
 * Screen-level hook: live refresh + channel drop/recover toasts.
 * Handlers may be recreated freely — they are kept in refs.
 */
export function useCampusRealtime(
  onChange: ChangeListener,
  onStatus?: StatusListener
): void {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    startRealtime();
    const offChange = onCampusChange((change) => changeRef.current(change));
    const offStatus = onCampusStatus((status) => statusRef.current?.(status));
    return () => {
      offChange();
      offStatus();
    };
  }, []);
}

/** True once the shared channel has been created (for diagnostics). */
export function isRealtimeStarted(): boolean {
  return subscribedOnce;
}

type StatusToastApi = {
  warning: (message: string) => void;
  success: (message: string) => void;
};

/**
 * Returns a status handler that toasts when the realtime channel drops
 * or recovers (spec UX: toast when the channel drops/recovers).
 */
export function useRealtimeStatusToast(toast: StatusToastApi) {
  const prevRef = useRef<RealtimeStatus | null>(null);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  return useCallback((status: RealtimeStatus) => {
    const prev = prevRef.current;
    prevRef.current = status;

    if (
      (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') &&
      prev !== status
    ) {
      toastRef.current.warning('Live updates interrupted. Reconnecting...');
    } else if (status === 'SUBSCRIBED' && prev !== null && prev !== 'SUBSCRIBED') {
      toastRef.current.success('Live updates restored.');
    }
  }, []);
}
