import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import EmptyState from '@/components/EmptyState';
import StatusPill, { eventStatusTone } from '@/components/StatusPill';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  deleteEvent,
  listVisibleEvents,
  setEventStatus,
} from '@/lib/campusqr/events';
import { formatDateTime } from '@/lib/campusqr/format';
import {
  useCampusRealtime,
  useRealtimeStatusToast,
} from '@/lib/campusqr/realtime';
import { useCampusRole } from '@/lib/campusqr/roles';
import type { EventRow, EventStatus } from '@/types/database';

const STATUS_FILTERS = ['all', 'draft', 'open', 'closed'] as const;
type Filter = (typeof STATUS_FILTERS)[number];

/**
 * Events list (spec Phase 3): role-aware content — students see only
 * open events; teachers see their own; admins see all. Live-refreshes
 * via the shared realtime channel.
 */
export default function EventsScreen() {
  const { user } = useAuth();
  const { role, isStaff, loading: roleLoading } = useCampusRole();
  const toast = useToast();
  const router = useRouter();
  const onStatus = useRealtimeStatusToast(toast);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    const rows = await listVisibleEvents(role, user?.id ?? null);
    setEvents(rows);
    setLoading(false);
  }, [role, user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useCampusRealtime(
    (change) => {
      if (change.table === 'events') load();
    },
    onStatus
  );

  const visible =
    filter === 'all' ? events : events.filter((event) => event.status === filter);

  const handleToggleStatus = async (event: EventRow) => {
    const next: EventStatus = event.status === 'open' ? 'closed' : 'open';
    const { error } = await setEventStatus(event.id, next);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(next === 'open' ? 'Event opened.' : 'Event closed.');
    load();
  };

  const handleDelete = (event: EventRow) => {
    Alert.alert('Delete event', `Delete "${event.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteEvent(event.id);
          if (error) {
            toast.error(error);
            return;
          }
          toast.success('Event deleted.');
          load();
        },
      },
    ]);
  };

  if (roleLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((option) => {
          const active = filter === option;
          return (
            <Pressable
              key={option}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(option)}
              accessibilityRole="button"
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {option === 'all' ? 'All' : option}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {visible.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No events yet..."
            message={isStaff ? 'Create your first event to get started.' : 'Check back later for open events.'}
          />
        ) : (
          visible.map((event) => {
            const canManage = isStaff && (role === 'admin' || event.created_by === user?.id);
            return (
              <View key={event.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{event.name}</Text>
                  <StatusPill label={event.status} tone={eventStatusTone(event.status)} />
                </View>
                {event.venue ? <Text style={styles.meta}>{event.venue}</Text> : null}
                <Text style={styles.meta}>{formatDateTime(event.start_datetime)}</Text>
                {event.description ? (
                  <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
                ) : null}
                <View style={styles.actions}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => router.push(`/campus/qr-display?id=${event.id}`)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="qr-code-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.actionText}>QR</Text>
                  </Pressable>
                  {canManage && (
                    <>
                      <Pressable
                        style={styles.actionButton}
                        onPress={() => router.push(`/campus/event-form?id=${event.id}`)}
                        accessibilityRole="button"
                      >
                        <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                        <Text style={styles.actionText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionButton}
                        onPress={() => handleToggleStatus(event)}
                        accessibilityRole="button"
                      >
                        <Ionicons
                          name={event.status === 'open' ? 'lock-closed-outline' : 'lock-open-outline'}
                          size={18}
                          color={COLORS.primary}
                        />
                        <Text style={styles.actionText}>{event.status === 'open' ? 'Close' : 'Open'}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionButton}
                        onPress={() => handleDelete(event)}
                        accessibilityRole="button"
                      >
                        <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                        <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {isStaff && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push('/campus/event-form')}
          accessibilityRole="button"
          accessibilityLabel="Create event"
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: {
    flex: 1, backgroundColor: COLORS.background,
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterChip: {
    minHeight: 44, paddingHorizontal: 16, justifyContent: 'center',
    borderRadius: 999, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'capitalize' },
  filterTextActive: { color: '#FFFFFF' },
  list: { paddingHorizontal: 16, paddingBottom: 96, gap: 12 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  meta: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 2 },
  description: { fontSize: 14, color: COLORS.textPrimary, marginTop: 6, lineHeight: 20 },
  actions: { flexDirection: 'row', marginTop: 12, gap: 4 },
  actionButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 4 },
  actionText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  deleteText: { color: COLORS.danger },
  fab: {
    position: 'absolute', right: 20, bottom: 28, width: 60, height: 60,
    borderRadius: 30, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', elevation: 5,
    shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 6,
  },
});
