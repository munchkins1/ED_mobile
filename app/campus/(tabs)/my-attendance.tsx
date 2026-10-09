import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EmptyState from '@/components/EmptyState';
import StatusPill, { attendanceStatusTone } from '@/components/StatusPill';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { fetchOwnHistory, type OwnAttendanceRecord } from '@/lib/campusqr/attendance';
import { formatDateTime } from '@/lib/campusqr/format';
import {
  useCampusRealtime,
  useRealtimeStatusToast,
} from '@/lib/campusqr/realtime';

/**
 * My Attendance — the signed-in student's own check-in history
 * (spec Phase 5). Live-refreshes via the shared realtime channel
 * with echo suppression right after a local mutation.
 */
export default function MyAttendanceScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const onStatus = useRealtimeStatusToast(toast);
  const [records, setRecords] = useState<OwnAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const rows = await fetchOwnHistory(user.id);
    setRecords(rows);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useCampusRealtime(
    (change) => {
      if (change.table === 'attendance') load();
    },
    onStatus
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>My Attendance</Text>
        {loading ? (
          <Text style={styles.hint}>Loading your records...</Text>
        ) : records.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title="You have no attendance records yet."
            message="Scan an event QR code to record your first check-in."
          />
        ) : (
          records.map((row) => (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.eventName}>{row.event?.name ?? 'Event'}</Text>
                <StatusPill label={row.status} tone={attendanceStatusTone(row.status)} />
              </View>
              <Text style={styles.meta}>{formatDateTime(row.recorded_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  hint: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 24 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  eventName: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  meta: { fontSize: 13, color: COLORS.textSecondary },
});
