import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BusyButton from '@/components/BusyButton';
import Header from '@/components/Header';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { signIn } from '@/lib/campusqr/auth';
import { defaultTabFor, getCurrentProfile } from '@/lib/campusqr/roles';

/** CampusQR Login (spec Phase 2): email + password, session persisted. */
export default function CampusLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await signIn(
        email.trim(),
        password
      );

      if (authError) {
        setError(authError.message);
        toast.error(authError.message);
        return;
      }

      const user = data.session?.user;
      const profile = user ? await getCurrentProfile(user.id) : null;
      toast.success('Signed in successfully.');
      router.replace(defaultTabFor(profile?.role ?? null));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerContainer}>
              <Header title="CampusQR" />
            </View>

            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>
              Sign in to view events and record attendance
            </Text>

            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your.email@school.edu"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry
                editable={!loading}
              />

              {error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.actionContainer}>
                <BusyButton
                  title="Sign In"
                  loadingTitle="Signing In..."
                  icon="log-in-outline"
                  onPress={handleLogin}
                  loading={loading}
                />
              </View>
            </View>

            <Link href="/campus/register" style={styles.link}>
              Don&apos;t have an account? Sign Up
            </Link>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 32,
  },
  form: {
    width: '100%',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
    textAlign: 'left',
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    textAlign: 'left',
  },
  error: {
    fontSize: 14,
    color: COLORS.danger,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  actionContainer: {
    marginTop: 24,
    width: '100%',
  },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
