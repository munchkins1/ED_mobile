import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getAttendanceHistory, type AttendanceRecord } from '@/lib/attendance';
import { useRole } from '@/lib/role';
import { getTeacherEventAttendance, type TeacherEventAttendance } from '@/lib/attendance';

export default function HistoryScreen() {
  const { user } = useAuth();
  const { role } = useRole();
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!user) {
      setStudentRecords([]);
      setTeacherEvents([]);
      setLoading(false);
      return;
    }

    try {
      if (role === 'teacher') {
        const events = await getTeacherEventAttendance(user.id);
        setTeacherEvents(events);
        setStudentRecords([]);
      } else {
        const records = await getAttendanceHistory(user.id);
        setStudentRecords(records);
        setTeacherEvents([]);
      }
    } catch {
      setStudentRecords([]);
      setTeacherEvents([]);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {role === 'teacher' ? 'Event Attendance Overview' : 'Attendance History'}
      </Text>

      {loading ? (
        <Text style={styles.subtitle}>Loading records...</Text>
      ) : role === 'teacher' ? (
        // --- TEACHER VIEW ---
        teacherEvents.length === 0 ? (
          <Text style={styles.subtitle}>
            No events created yet. Create an event to see attendance.
          </Text>
        ) : (
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => String(item.eventId)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.attendeeCount} attended</Text>
                  </View>
                </View>

                <Text style={styles.eventMeta}>Code: {item.eventCode}</Text>
                <Text style={styles.eventMeta}>
                  Started: {formatDateTime(item.startTime)}
                </Text>
                <Text style={styles.eventMeta}>
                  Ended: {formatDateTime(item.endTime)}
                </Text>

                {/* Attendees Sub-list */}
                <View style={styles.attendeeListContainer}>
                  <Text style={styles.attendeeHeader}>
                    Students present ({item.attendeeCount})
                  </Text>
                  {item.attendees.length === 0 ? (
                    <Text style={styles.attendeeEmpty}>No students scanned yet.</Text>
                  ) : (
                    item.attendees.map((att, index) => (
                      <View key={`${att.studentId}-${index}`} style={styles.attendeeRow}>
                        <Text style={styles.attendeeName} numberOfLines={1}>
                          {displayStudent(att)}
                        </Text>
                        <Text style={styles.attendeeTime}>
                          {formatDateTime(att.scannedAt)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}
          />
        )
      ) : (
        // --- STUDENT VIEW ---
        studentRecords.length === 0 ? (
          <Text style={styles.subtitle}>
            No records yet. Scan a QR code to register your attendance.
          </Text>
        ) : (
          <FlatList
            data={studentRecords}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.eventTitle}>{item.eventTitle}</Text>
                <Text style={styles.eventMeta}>{item.eventId}</Text>
                <Text style={styles.eventMeta}>{formatDateTime(item.scannedAt)}</Text>
              </View>
            )}
          />
        )
      )}
    </View>
  );
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return 'Not set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'unknown';
}

function displayStudent(att: {
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
}) {
  return att.studentName?.trim() || att.studentEmail || shortId(att.studentId);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 32,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#E6F4EA', // soft green background
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#137333', // dark green text
  },
  attendeeListContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 8,
  },
  attendeeHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  attendeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  attendeeName: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  attendeeTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  attendeeEmpty: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 2,
  },
});