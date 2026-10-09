import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EmptyState from '@/components/EmptyState';
import LockedView from '@/components/LockedView';
import StatusPill, { attendanceStatusTone } from '@/components/StatusPill';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  PERIOD_OPTIONS,
  fetchAuditLog,
  fetchSummaries,
  summariesToCsv,
  type AuditLogEntry,
  type EventSummary,
  type Period,
} from '@/lib/campusqr/reports';
import { formatDate, formatDateTime, formatNumber } from '@/lib/campusqr/format';
import {
  useCampusRealtime,
  useRealtimeStatusToast,
} from '@/lib/campusqr/realtime';
import { useCampusRole } from '@/lib/campusqr/roles';
import type { AttendanceStatus } from '@/types/database';

const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

/**
 * System Reports (admin, spec Phase 6): attendance counts per
 * event/period/status, CSV export via the Share sheet, and the
 * System Activity Log (audit_logs). Live-refreshes on realtime changes.
 */
export default function SystemReportsScreen() {
  const { user } = useAuth();
  const { role, isAdmin, isStaff, loading: roleLoading } = useCampusRole();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const onStatus = useRealtimeStatusToast(toast);

  const [period, setPeriod] = useState<Period>('all');
  const [summaries, setSummaries] = useState<EventSummary[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchSummaries(role, user?.id ?? null, period);
      setSummaries(rows);
      // The activity log is admin-only (RLS denies it for anyone else),
      // so only admins query it — teachers get summaries alone.
      if (isAdmin) {
        const log = await fetchAuditLog(100);
        setAudit(log);
      } else {
        setAudit([]);
      }
    } finally {
      setLoading(false);
    }
  }, [role, user?.id, period, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useCampusRealtime(
    (change) => {
      if (change.table === 'attendance' || change.table === 'events') load();
      if (change.table === 'audit_logs' && isAdmin) {
        fetchAuditLog(100).then(setAudit).catch(() => {});
      }
    },
    onStatus
  );

  if (!roleLoading && !isStaff) {
    return <LockedView message="Only teachers and administrators can view summaries." />;
  }

  const handleShare = async () => {
    if (summaries.length === 0) {
      toast.info('There is nothing to export yet.');
      return;
    }
    setSharing(true);
    try {
      await Share.share({
        title: 'CampusQR attendance report',
        message: summariesToCsv(summaries),
      });
    } catch {
      toast.error('Could not open the share sheet.');
    } finally {
      setSharing(false);
    }
  };

  const totals = summaries.reduce(
    (acc, s) => {
      acc.total += s.total;
      for (const status of STATUS_ORDER) acc.counts[status] += s.counts[status];
      return acc;
    },
    { total: 0, counts: { present: 0, late: 0, absent: 0, excused: 0 } as Record<AttendanceStatus, number> }
  );
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>System Reports</Text>
          <Pressable
            style={[styles.shareButton, sharing && styles.disabled]}
            onPress={handleShare}
            disabled={sharing}
            accessibilityRole="button"
          >
            <Text style={styles.shareText}>{sharing ? 'Sharing...' : 'Export CSV'}</Text>
          </Pressable>
        </View>
        <View style={styles.periodRow}>
          {PERIOD_OPTIONS.map((option) => {
            const active = period === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.periodChip, active && styles.periodChipActive]}
                onPress={() => setPeriod(option.value)}
                accessibilityRole="button"
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.hint}>Loading reports...</Text>
          </View>
        ) : summaries.length === 0 ? (
          <EmptyState
            icon="bar-chart-outline"
            title="No attendance data yet."
            message="Check-ins will appear here once students start scanning."
          />
        ) : (
          <>
            <View style={styles.totalsCard}>
              <Text style={styles.cardTitle}>Total check-ins: {formatNumber(totals.total)}</Text>
              <View style={styles.pillRow}>
                {STATUS_ORDER.map((status) => (
                  <StatusPill
                    key={status}
                    label={`${status}: ${totals.counts[status]}`}
                    tone={attendanceStatusTone(status)}
                  />
                ))}
              </View>
            </View>
            {summaries.map((summary) => (
              <View key={summary.eventId} style={styles.card}>
                <Text style={styles.cardTitle}>{summary.name}</Text>
                <Text style={styles.hint}>{formatDate(summary.start)}</Text>
                <View style={styles.pillRow}>
                  {STATUS_ORDER.map((status) => (
                    <StatusPill
                      key={status}
                      label={`${status}: ${summary.counts[status]}`}
                      tone={attendanceStatusTone(status)}
                    />
                  ))}
                </View>
                <Text style={styles.total}>Total: {formatNumber(summary.total)}</Text>
              </View>
            ))}
          </>
        )}
        {isAdmin && (
          <>
            <Text style={styles.sectionTitle}>System Activity Log</Text>
            {audit.length === 0 ? (
              <Text style={styles.hint}>No audit activity yet.</Text>
            ) : (
              audit.map((entry) => (
                <View key={entry.id} style={styles.logCard}>
                  <Text style={styles.logAction}>{entry.action ?? '(no action)'}</Text>
                  <Text style={styles.hint}>
                    {entry.entity ?? ''} {entry.entity_id ?? ''} — {formatDateTime(entry.created_at)}
                  </Text>
                  {entry.actor ? (
                    <Text style={styles.hint}>
                      {entry.actor.full_name} ({entry.actor.email})
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  shareButton: {
    minHeight: 44, paddingHorizontal: 16, justifyContent: 'center',
    borderRadius: 10, backgroundColor: COLORS.primary,
  },
  shareText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  disabled: { opacity: 0.6 },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodChip: {
    minHeight: 44, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: 999, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  periodChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  periodTextActive: { color: '#FFFFFF' },
  loadingBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  hint: { fontSize: 13, color: COLORS.textSecondary },
  totalsCard: {
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 10,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  total: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginTop: 8 },
  logCard: {
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 4,
  },
  logAction: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
});