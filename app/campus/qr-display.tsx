import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import QRDisplay from '@/components/QRDisplay';
import StatusPill, { eventStatusTone } from '@/components/StatusPill';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { getEventById, qrPayload, setEventStatus } from '@/lib/campusqr/events';
import { formatDateTime } from '@/lib/campusqr/format';
import type { EventRow } from '@/types/database';

/** CampusQR QR display (spec Phase 3): fullscreen-friendly code + copy fallback. */
export default function CampusQrDisplayScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const eventId = typeof id === 'string' ? id : '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    const row = await getEventById(eventId);
    setEvent(row);
    setLoading(false);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleCopy = () => {
    if (!event) return;
    // No new clipboard dependency: the QRDisplay caption already shows the
    // full CAMPUSQR:<token> payload, which students type into the scan
    // screen's manual-code input.
    toast.info('Type the code shown under the QR into the Scan screen.');
  };

  const handleToggle = async () => {
    if (!event) return;
    setBusy(true);
    try {
      const next = event.status === 'open' ? 'closed' : 'open';
      const { error } = await setEventStatus(event.id, next);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(next === 'open' ? 'Event opened.' : 'Event closed.');
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.hint}>Loading event...</Text>
          </View>
        ) : !event ? (
          <View style={styles.center}>
            <Text style={styles.title}>Event not found</Text>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryText}>Go back</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>{event.name}</Text>
              <StatusPill label={event.status} tone={eventStatusTone(event.status)} />
            </View>
            <Text style={styles.meta}>{formatDateTime(event.start_datetime)}</Text>
            {event.venue ? <Text style={styles.meta}>{event.venue}</Text> : null}
            <View style={styles.qrWrap}>
              <QRDisplay value={qrPayload(event)} size={264} caption={qrPayload(event)} />
            </View>
            <Pressable style={styles.secondaryButton} onPress={handleCopy}>
              <Ionicons name="keypad-outline" size={18} color={COLORS.primary} />
              <Text style={styles.secondaryText}>How do students check in?</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleToggle} disabled={busy}>
              <Ionicons
                name={event.status === 'open' ? 'lock-closed-outline' : 'lock-open-outline'}
                size={18}
                color={COLORS.primary}
              />
              <Text style={styles.secondaryText}>
                {busy ? 'Working...' : event.status === 'open' ? 'Close event' : 'Open event'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8, alignItems: 'center' },
  center: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4, width: '100%' },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  meta: { fontSize: 13, color: COLORS.textSecondary, width: '100%', marginBottom: 2 },
  hint: { fontSize: 14, color: COLORS.textSecondary },
  qrWrap: { marginVertical: 24, width: '100%' },
  secondaryButton: {
    minHeight: 48, width: '100%', flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
});
