import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import Dropdown, { type DropdownOption } from '@/components/Dropdown';
import EmptyState from '@/components/EmptyState';
import StatusPill, { attendanceStatusTone } from '@/components/StatusPill';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import {
  deleteAttendance,
  updateAttendance,
  type EventAttendanceRecord,
} from '@/lib/campusqr/attendance';
import { formatDateTime } from '@/lib/campusqr/format';
import type { AttendanceStatus } from '@/types/database';

export const ATTENDANCE_FILTERS = ['all', 'present', 'late', 'absent', 'excused'] as const;
export type AttendanceFilter = (typeof ATTENDANCE_FILTERS)[number];

const STATUS_EDIT_OPTIONS: DropdownOption[] = [
  { label: 'Present', value: 'present' },
  { label: 'Late', value: 'late' },
  { label: 'Absent', value: 'absent' },
  { label: 'Excused', value: 'excused' },
];

type Props = {
  records: EventAttendanceRecord[];
  loading: boolean;
  /** Set for owners/admins — enables per-row status edit + delete. */
  canEdit?: boolean;
  onChanged?: () => void;
};

/**
 * Shared attendance records list (Phase 5): status pills, status/keyword
 * filters, and per-row Correct Records actions (update status / delete)
 * with re-read verification surfaced through the data layer.
 */
export default function AttendanceRecords({ records, loading, canEdit = false, onChanged }: Props) {
  const toast = useToast();
  const [filter, setFilter] = useState<AttendanceFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = records.filter((row) => {
    if (filter !== 'all' && row.status !== filter) return false;
    const key = keyword.trim().toLowerCase();
    if (!key) return true;
    const hay = [row.student?.full_name ?? '', row.student?.email ?? '', row.student?.student_no ?? '']
      .join(' ').toLowerCase();
    return hay.includes(key);
  });

  const handleStatusChange = async (id: string, status: AttendanceStatus) => {
    setBusyId(id);
    try {
      const { error } = await updateAttendance(id, status);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Attendance updated.');
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (row: EventAttendanceRecord) => {
    Alert.alert(
      'Delete record',
      `Remove ${row.student?.full_name ?? 'this student'}'s attendance record? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(row.id);
            try {
              const { error } = await deleteAttendance(row.id);
              if (error) {
                toast.error(error);
                return;
              }
              toast.success('Record deleted.');
              onChanged?.();
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <Text style={styles.hint}>Loading records...</Text>;
  }

  return (
    <View>
      <View style={styles.filterRow}>
        {ATTENDANCE_FILTERS.map((option) => {
          const active = filter === option;
          return (
            <Pressable
              key={option}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(option)}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        style={styles.search}
        value={keyword}
        onChangeText={setKeyword}
        placeholder="Search name, email, student no."
        placeholderTextColor={COLORS.textSecondary}
      />
      {visible.length === 0 ? (
        <EmptyState icon="list-outline" title="No attendance records yet."
          message="Records will appear here once students check in." />
      ) : (
        visible.map((row) => (
          <View key={row.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{row.student?.full_name ?? 'Unknown student'}</Text>
              <StatusPill label={row.status} tone={attendanceStatusTone(row.status)} />
            </View>
            <Text style={styles.meta}>
              {[row.student?.student_no, row.student?.email].filter(Boolean).join('  •  ')}
            </Text>
            <Text style={styles.meta}>{formatDateTime(row.recorded_at)}</Text>
            {canEdit && (
              <View style={styles.editRow}>
                <View style={styles.editDropdown}>
                  <Dropdown
                    value={row.status}
                    options={STATUS_EDIT_OPTIONS}
                    onChange={(value) => handleStatusChange(row.id, value as AttendanceStatus)}
                    disabled={busyId === row.id}
                  />
                </View>
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => handleDelete(row)}
                  disabled={busyId === row.id}
                  accessibilityRole="button"
                  accessibilityLabel="Delete record"
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'capitalize' },
  chipTextActive: { color: '#FFFFFF' },
  search: {
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.textPrimary, marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  meta: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 2 },
  editRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 8 },
  editDropdown: { flex: 1 },
  deleteButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});