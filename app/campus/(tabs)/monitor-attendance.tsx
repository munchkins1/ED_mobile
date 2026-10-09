import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AttendanceRecords from '@/components/AttendanceRecords';
import Dropdown from '@/components/Dropdown';
import LockedView from '@/components/LockedView';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  fetchEventRecords,
  type EventAttendanceRecord,
} from '@/lib/campusqr/attendance';
import { listVisibleEvents } from '@/lib/campusqr/events';
import {
  useCampusRealtime,
  useRealtimeStatusToast,
} from '@/lib/campusqr/realtime';
import { useCampusRole } from '@/lib/campusqr/roles';
import type { EventRow } from '@/types/database';

/**
 * Monitor Attendance (staff, spec Phase 5): per-event records with
 * status pills, filters, and per-row Correct Records actions.
 * Live-refreshes with echo suppression after local mutations.
 */
export default function MonitorAttendanceScreen() {
  const { user } = useAuth();
  const { role, isStaff, loading: roleLoading } = useCampusRole();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const onStatus = useRealtimeStatusToast(toast);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [records, setRecords] = useState<EventAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    const rows = await listVisibleEvents(role, user?.id ?? null);
    setEvents(rows);
    if (!selectedId && rows.length > 0) setSelectedId(rows[0].id);
    setLoading(false);
  }, [role, user?.id, selectedId]);

  const loadRecords = useCallback(async () => {
    if (!selectedId) return;
    const rows = await fetchEventRecords(selectedId);
    setRecords(rows);
  }, [selectedId]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, [loadRecords])
  );

  useCampusRealtime(
    (change) => {
      if (change.table === 'attendance') loadRecords();
      if (change.table === 'events') loadEvents();
    },
    onStatus
  );

  if (!roleLoading && !isStaff) {
    return <LockedView message="Only teachers and administrators can monitor attendance." />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Monitor Attendance</Text>
        {loading ? (
          <Text style={styles.hint}>Loading events...</Text>
        ) : events.length === 0 ? (
          <Text style={styles.hint}>No events to monitor yet.</Text>
        ) : (
          <>
            <Dropdown
              label="Event"
              value={selectedId}
              options={events.map((event) => ({ label: `${event.name} (${event.status})`, value: event.id }))}
              onChange={setSelectedId}
            />
            <AttendanceRecords
              records={records}
              loading={false}
              canEdit
              onChanged={loadRecords}
            />
          </>
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
});
