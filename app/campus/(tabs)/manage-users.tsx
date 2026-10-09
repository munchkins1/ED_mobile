import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import BusyButton from '@/components/BusyButton';
import Dropdown from '@/components/Dropdown';
import EducationFields from '@/components/EducationFields';
import EmptyState from '@/components/EmptyState';
import LockedView from '@/components/LockedView';
import StatusPill, { roleTone } from '@/components/StatusPill';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  deleteUser,
  listUsers,
  setActive,
  setRole,
  updateUser,
} from '@/lib/campusqr/admin';
import {
  EMPTY_EDUCATION,
  educationFromProfile,
  validateLevelFields,
  type EducationValues,
} from '@/lib/campusqr/education';
import { buildProfilePatch } from '@/lib/campusqr/profiles';
import {
  useCampusRealtime,
  useRealtimeStatusToast,
} from '@/lib/campusqr/realtime';
import { useCampusRole } from '@/lib/campusqr/roles';
import type { Profile, UserRole } from '@/types/database';

const ROLE_ACTIONS: UserRole[] = ['student', 'teacher', 'admin'];

type EditState = {
  target: Profile;
  fullName: string;
  phone: string;
  studentNo: string;
  title: string;
  education: EducationValues;
  saving: boolean;
};

/**
 * Manage Users (admin, spec Phase 6): searchable table with role badge
 * and active/inactive state; Edit modal with Personal + Educational
 * blocks; role/activation/deletion through the admin RPCs.
 */
export default function ManageUsersScreen() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useCampusRole();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const onStatus = useRealtimeStatusToast(toast);

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await listUsers();
    setUsers(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useCampusRealtime(
    (change) => {
      if (change.table === 'profiles') load();
    },
    onStatus
  );

  if (!roleLoading && role !== 'admin') {
    return <LockedView message="Only administrators can manage users." />;
  }

  const filtered = users.filter((row) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      row.email.toLowerCase().includes(query) ||
      row.full_name.toLowerCase().includes(query) ||
      (row.student_no ?? '').toLowerCase().includes(query)
    );
  });

  const openEdit = (target: Profile) => {
    setEdit({
      target,
      fullName: target.full_name,
      phone: target.phone ?? '',
      studentNo: target.student_no ?? '',
      title: target.title ?? '',
      education: educationFromProfile(target),
      saving: false,
    });
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!edit) return;
    setEditError(null);
    const errors = validateLevelFields(edit.education);
    const firstError =
      errors.course ?? errors.year_level ?? errors.block ?? errors.section;
    if (firstError) {
      setEditError(firstError);
      return;
    }
    const patch = buildProfilePatch({
      full_name: edit.fullName,
      phone: edit.phone,
      student_no: edit.studentNo,
      title: edit.title,
      education: edit.education,
    });
    setEdit({ ...edit, saving: true });
    try {
      const { error, refused } = await updateUser(edit.target.id, patch);
      if (error) {
        setEditError(
          refused.length > 0
            ? `${error} Refused fields: ${refused.join(', ')}.`
            : error
        );
        toast.error(error);
        return;
      }
      toast.success(
        refused.length > 0
          ? `Saved with warnings. Refused fields: ${refused.join(', ')}.`
          : 'User updated.'
      );
      setEdit(null);
      load();
    } finally {
      setEdit((prev) => (prev ? { ...prev, saving: false } : prev));
    }
  };

  const handleRole = (target: Profile, next: UserRole) => {
    if (target.role === next) return;
    Alert.alert('Change role', `Set ${target.email} to ${next}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          const outcome = await setRole(target.id, next);
          if (outcome.result === 'error') {
            toast.error(outcome.message);
            return;
          }
          toast.success(outcome.message || 'Role updated.');
          load();
        },
      },
    ]);
  };

  const handleToggleActive = (target: Profile) => {
    const next = !target.is_active;
    Alert.alert(
      next ? 'Activate user' : 'Deactivate user',
      `${next ? 'Activate' : 'Deactivate'} ${target.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: next ? 'default' : 'destructive',
          onPress: async () => {
            const outcome = await setActive(target.id, next);
            if (outcome.result === 'error') {
              toast.error(outcome.message);
              return;
            }
            toast.success(outcome.message || 'User updated.');
            load();
          },
        },
      ]
    );
  };

  const handleDelete = (target: Profile) => {
    if (target.id === user?.id) {
      toast.error('You cannot delete your own account.');
      return;
    }
    Alert.alert('Delete user', `Delete ${target.email}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const outcome = await deleteUser(target.id);
          if (outcome.result === 'error') {
            toast.error(outcome.message);
            return;
          }
          toast.success(outcome.message || 'User deleted.');
          load();
        },
      },
    ]);
  };

  if (roleLoading || loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.hint}>Loading users...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email or student no."
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <EmptyState icon="people-outline" title="No users found..."
            message="Try a different search." />
        ) : (
          filtered.map((row) => (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{row.full_name || row.email}</Text>
                <StatusPill label={row.role} tone={roleTone(row.role)} />
              </View>
              <Text style={styles.meta}>{row.email}</Text>
              <Text style={[styles.meta, row.is_active ? styles.active : styles.inactive]}>
                {row.is_active ? 'Active' : 'Inactive'}
              </Text>
              <View style={styles.row}>
                {ROLE_ACTIONS.map((option) => (
                  <Pressable
                    key={option}
                    style={[styles.chip, row.role === option && styles.chipActive]}
                    onPress={() => handleRole(row, option)}
                  >
                    <Text style={[styles.chipText, row.role === option && styles.chipTextActive]}>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.actionButton} onPress={() => openEdit(row)}>
                  <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => handleToggleActive(row)}>
                  <Ionicons
                    name={row.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                    size={18}
                    color={COLORS.primary}
                  />
                  <Text style={styles.actionText}>{row.is_active ? 'Deactivate' : 'Activate'}</Text>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => handleDelete(row)}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                  <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={edit !== null} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Edit user</Text>
              {edit && (
                <>
                  <Text style={styles.sectionTitle}>Personal Information</Text>
                  <Text style={styles.label}>Email (read-only)</Text>
                  <TextInput style={[styles.input, styles.readonly]} value={edit.target.email} editable={false} />
                  <Text style={styles.label}>Full name</Text>
                  <TextInput style={styles.input} value={edit.fullName}
                    onChangeText={(fullName) => setEdit({ ...edit, fullName })}
                    placeholder="Full name" placeholderTextColor={COLORS.textSecondary} />
                  <Text style={styles.label}>Phone</Text>
                  <TextInput style={styles.input} value={edit.phone}
                    onChangeText={(phone) => setEdit({ ...edit, phone })}
                    placeholder="Phone" placeholderTextColor={COLORS.textSecondary} />
                  <Text style={styles.label}>Student number</Text>
                  <TextInput style={styles.input} value={edit.studentNo}
                    onChangeText={(studentNo) => setEdit({ ...edit, studentNo })}
                    placeholder="Student number" placeholderTextColor={COLORS.textSecondary} />
                  <Text style={styles.label}>Title</Text>
                  <TextInput style={styles.input} value={edit.title}
                    onChangeText={(title) => setEdit({ ...edit, title })}
                    placeholder="Title" placeholderTextColor={COLORS.textSecondary} />
                  <Text style={styles.sectionTitle}>Educational Information</Text>
                  <EducationFields
                    value={edit.education}
                    onChange={(education) => setEdit({ ...edit, education })}
                  />
                  <Dropdown label="Role" value={edit.target.role}
                    options={ROLE_ACTIONS.map((r) => ({ label: r, value: r }))}
                    onChange={(value) => handleRole(edit.target, value as UserRole)} />
                  {editError && <Text style={styles.error}>{editError}</Text>}
                  <BusyButton title="Save Changes" loadingTitle="Saving..."
                    icon="checkmark-outline" onPress={handleSaveEdit} loading={edit.saving} />
                  <Pressable style={styles.closeButton} onPress={() => setEdit(null)}>
                    <Text style={styles.closeText}>Close</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', gap: 10 },
  hint: { fontSize: 14, color: COLORS.textSecondary },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8,
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, minHeight: 48,
  },
  search: { flex: 1, fontSize: 15, color: COLORS.textPrimary, minHeight: 44 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  card: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, flex: 1 },
  meta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  active: { color: COLORS.success, fontWeight: '600' },
  inactive: { color: COLORS.danger, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 6, marginTop: 10 },
  chip: {
    minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'capitalize' },
  chipTextActive: { color: '#FFFFFF' },
  actions: { flexDirection: 'row', marginTop: 6, gap: 2 },
  actionButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 4 },
  actionText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  deleteText: { color: COLORS.danger },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { backgroundColor: COLORS.card, borderRadius: 14, maxHeight: '88%' },
  sheetScroll: { padding: 18, paddingBottom: 28 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.primary, marginTop: 12, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary,
  },
  readonly: { opacity: 0.7 },
  error: { fontSize: 14, color: COLORS.danger, textAlign: 'center', marginTop: 10 },
  closeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
});
