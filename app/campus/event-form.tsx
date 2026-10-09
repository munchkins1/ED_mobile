import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BusyButton from '@/components/BusyButton';
import DateTimeField from '@/components/DateTimeField';
import Dropdown, { type DropdownOption } from '@/components/Dropdown';
import LockedView from '@/components/LockedView';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  getEventById,
  saveNewEvent,
  updateEvent,
  type EventInput,
} from '@/lib/campusqr/events';
import { useCampusRole } from '@/lib/campusqr/roles';
import type { EventStatus } from '@/types/database';

const STATUS_OPTIONS: DropdownOption[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
];

/**
 * CampusQR event create/edit form (spec Phase 3): name, description,
 * venue, start, end, status — validates end >= start through the
 * data-layer module. Staff only.
 */
export default function CampusEventFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof id === 'string' ? id : undefined;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const { role, isStaff, loading: roleLoading } = useCampusRole();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [status, setStatus] = useState<EventStatus>('draft');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingEvent, setLoadingEvent] = useState(!!editingId);

  useEffect(() => {
    if (!editingId) return;
    getEventById(editingId)
      .then((row) => {
        if (!row) {
          setError('Event not found.');
          return;
        }
        setName(row.name);
        setDescription(row.description ?? '');
        setVenue(row.venue ?? '');
        setStart(row.start_datetime);
        setEnd(row.end_datetime);
        setStatus(row.status);
      })
      .finally(() => setLoadingEvent(false));
  }, [editingId]);

  if (!roleLoading && !isStaff) {
    return <LockedView message="Only teachers and administrators can manage events." />;
  }

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Event name is required.');
      return;
    }
    const input: EventInput = {
      name: name.trim(),
      description: description.trim() || null,
      venue: venue.trim() || null,
      start_datetime: start,
      end_datetime: end,
      status,
    };
    setLoading(true);
    try {
      if (editingId) {
        const { error: saveError } = await updateEvent(editingId, input);
        if (saveError) {
          setError(saveError);
          toast.error(saveError);
          return;
        }
        toast.success('Event updated.');
      } else {
        const { error: saveError } = await saveNewEvent(input, user?.id ?? '');
        if (saveError) {
          setError(saveError);
          toast.error(saveError);
          return;
        }
        toast.success('Event created.');
      }
      router.back();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{editingId ? 'Edit Event' : 'Create Event'}</Text>
          {loadingEvent ? (
            <Text style={styles.hint}>Loading event...</Text>
          ) : (
            <>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName}
                placeholder="Event name" placeholderTextColor={COLORS.textSecondary} editable={!loading} />
              <Text style={styles.label}>Description</Text>
              <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
                placeholder="What is this event about?" placeholderTextColor={COLORS.textSecondary}
                multiline editable={!loading} />
              <Text style={styles.label}>Venue</Text>
              <TextInput style={styles.input} value={venue} onChangeText={setVenue}
                placeholder="Where will it be held?" placeholderTextColor={COLORS.textSecondary} editable={!loading} />
              <DateTimeField label="Start" value={start} onChange={setStart} disabled={loading} />
              <DateTimeField label="End" value={end} onChange={setEnd} disabled={loading} />
              <Dropdown label="Status" value={status} options={STATUS_OPTIONS}
                onChange={(value) => setStatus(value as EventStatus)} disabled={loading} />
              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.actions}>
                <BusyButton title={editingId ? 'Save Changes' : 'Create Event'} loadingTitle="Saving..."
                  icon="checkmark-outline" onPress={handleSave} loading={loading} />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: COLORS.textSecondary, marginTop: 8 },
  error: { fontSize: 14, color: COLORS.danger, textAlign: 'center', marginTop: 12 },
  actions: { marginTop: 24 },
});