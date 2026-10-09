import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { signOut, useAuth } from '@/lib/auth';
import { getProfile, saveProfile, Profile } from '@/lib/profiles';
import { useRole } from '@/lib/role';

export default function ProfileScreen() {
  const { user } = useAuth();
  const { role } = useRole();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const p = await getProfile(user.id);
    setProfile(p);
    setDraftName(p?.full_name ?? '');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user) return;

    const name = draftName.trim();
    if (!name) {
      Alert.alert('Invalid name', 'Please enter your name.');
      return;
    }

    setSaving(true);
    const { error } = await saveProfile(user.id, user.email, {
      full_name: name,
    });

    if (error) {
      setSaving(false);
      Alert.alert('Error', error);
      return;
    }

    // Re-read the row so the screen always shows the persisted value.
    await loadProfile();
    setSaving(false);
    setEditing(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to sign out.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>

      {user && (
        <View style={styles.infoCard}>
          {/* Role Badge */}
          {role === 'teacher' ? (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>Teacher</Text>
            </View>
          ) : (
            <View style={[styles.roleBadge, styles.roleBadgeStudent]}>
              <Text style={styles.roleBadgeText}>Student</Text>
            </View>
          )}

          {/* Full Name Row */}
          <Text style={styles.label}>Full Name</Text>
          {editing ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.input}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textSecondary}
                autoFocus
                editable={!saving}
              />
              <Pressable
                style={styles.saveButton}
                onPress={handleSaveName}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameRow}>
              <Text style={styles.value}>
                {profile?.full_name || 'Tap to add your name'}
              </Text>
              <Text style={styles.editHint}>Edit</Text>
            </Pressable>
          )}

          {/* Email */}
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user.email}</Text>

          {/* User ID */}
          <Text style={styles.label}>User ID</Text>
          <Text style={styles.valueSmall}>{user.id}</Text>
        </View>
      )}

      <AppButton
        title={loading ? 'Signing Out...' : 'Sign Out'}
        icon="log-out-outline"
        onPress={handleSignOut}
        disabled={loading}
      />
    </View>
  );
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
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  roleBadgeStudent: {
    backgroundColor: '#0288D1', // Distinct accent blue for students
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: 10,
  },
  value: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  valueSmall: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editHint: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});