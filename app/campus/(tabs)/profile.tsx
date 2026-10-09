import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import BusyButton from '@/components/BusyButton';
import EducationFields from '@/components/EducationFields';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { signOut } from '@/lib/campusqr/auth';
import { fetchOwnHistory } from '@/lib/campusqr/attendance';
import {
  EMPTY_EDUCATION,
  educationFromProfile,
  validateLevelFields,
  type EducationErrors,
  type EducationValues,
} from '@/lib/campusqr/education';
import { formatDate } from '@/lib/campusqr/format';
import { fetchProfile, saveOwnProfile } from '@/lib/campusqr/profiles';
import {
  useCampusRealtime,
  useRealtimeStatusToast,
} from '@/lib/campusqr/realtime';
import { ROLE_LABEL, useCampusRole } from '@/lib/campusqr/roles';
import type { Profile } from '@/types/database';

/**
 * CampusQR Profile (spec Phase 7): stat cards (role, account created
 * date, events attended) plus an edit form limited to the eleven
 * self-editable columns — never role, is_active or email. The shared
 * buildProfilePatch writes department = course and
 * grade_class = formatGradeClass(...) on every save. Own-row updates
 * arrive live via the shared realtime channel.
 */
export default function CampusProfileScreen() {
  const { user } = useAuth();
  const { refresh: refreshRole } = useCampusRole();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const onStatus = useRealtimeStatusToast(toast);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [attended, setAttended] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [title, setTitle] = useState('');
  const [education, setEducation] = useState<EducationValues>({
    ...EMPTY_EDUCATION,
  });
  const [levelErrors, setLevelErrors] = useState<EducationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const [row, history] = await Promise.all([
      fetchProfile(user.id),
      fetchOwnHistory(user.id),
    ]);
    if (row) {
      setProfile(row);
      setFullName(row.full_name);
      setPhone(row.phone ?? '');
      setStudentNo(row.student_no ?? '');
      setTitle(row.title ?? '');
      setEducation(educationFromProfile(row));
    }
    setAttended(history.length);
    setLoading(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useCampusRealtime(
    (change) => {
      if (change.table !== 'profiles') return;
      const changedId = (change.new?.id ?? change.old?.id) as
        | string
        | undefined;
      if (changedId && changedId === user?.id) load();
    },
    onStatus
  );

  const handleSave = async () => {
    setError(null);
    setLevelErrors({});
    if (!user?.id) return;
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    const errors = validateLevelFields(education);
    if (Object.keys(errors).length > 0) {
      setLevelErrors(errors);
      setError('Please fix the highlighted education fields.');
      return;
    }
    setSaving(true);
    try {
      const { error: saveError } = await saveOwnProfile(user.id, {
        full_name: fullName,
        phone,
        student_no: studentNo,
        title,
        education,
      });
      if (saveError) {
        setError(saveError);
        toast.error(saveError);
        return;
      }
      toast.success('Profile updated.');
      refreshRole();
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/campus/login');
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.hint}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Profile</Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="shield-outline" size={22} color={COLORS.primary} />
              <Text style={styles.statLabel}>Role</Text>
              <Text style={styles.statValue}>
                {profile ? ROLE_LABEL[profile.role] : '...'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="calendar-outline" size={22} color={COLORS.primary} />
              <Text style={styles.statLabel}>Member since</Text>
              <Text style={styles.statValue}>
                {profile ? formatDate(profile.created_at) : '...'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color={COLORS.primary}
              />
              <Text style={styles.statLabel}>Events attended</Text>
              <Text style={styles.statValue}>{attended}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Text style={styles.label}>Email (read-only)</Text>
          <View style={styles.readonlyBox}>
            <Text style={styles.readonlyText}>{profile?.email ?? user?.email ?? ''}</Text>
          </View>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Full name"
            placeholderTextColor={COLORS.textSecondary}
            editable={!saving}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="phone-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Student number</Text>
          <TextInput
            style={styles.input}
            value={studentNo}
            onChangeText={setStudentNo}
            placeholder="Student number"
            placeholderTextColor={COLORS.textSecondary}
            editable={!saving}
          />

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Title (e.g. Mr., Ms.)"
            placeholderTextColor={COLORS.textSecondary}
            editable={!saving}
          />

          <Text style={styles.sectionTitle}>Educational Information</Text>
          <EducationFields
            value={education}
            onChange={setEducation}
            errors={levelErrors}
            disabled={saving}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <BusyButton
              title="Save Profile"
              loadingTitle="Saving..."
              icon="checkmark-outline"
              onPress={handleSave}
              loading={saving}
            />
            <Pressable
              style={styles.signOutButton}
              onPress={handleSignOut}
              disabled={signingOut}
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
              <Text style={styles.signOutText}>
                {signingOut ? 'Signing out...' : 'Sign out'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12 },
  loadingBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  hint: { fontSize: 14, color: COLORS.textSecondary },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  statCard: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 12, alignItems: 'center', gap: 4,
  },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
  statValue: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary, marginTop: 16, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: COLORS.textPrimary,
  },
  readonlyBox: {
    backgroundColor: COLORS.card, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, opacity: 0.75,
  },
  readonlyText: { fontSize: 16, color: COLORS.textSecondary },
  error: { fontSize: 14, color: COLORS.danger, textAlign: 'center', marginTop: 12 },
  actions: { marginTop: 24 },
  signOutButton: {
    minHeight: 48, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: COLORS.danger },
});