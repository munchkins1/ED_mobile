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
import EducationFields from '@/components/EducationFields';
import Header from '@/components/Header';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { signUp } from '@/lib/campusqr/auth';
import {
  EMPTY_EDUCATION,
  validateLevelFields,
  type EducationErrors,
  type EducationValues,
} from '@/lib/campusqr/education';

/**
 * CampusQR Register (spec Phase 2): full name, phone, student number and
 * the Educational Level dropdown that conditionally reveals fields per
 * level. Signup metadata NEVER carries role or is_active — the database
 * trigger hardcodes student.
 */
export default function CampusRegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [education, setEducation] = useState<EducationValues>({
    ...EMPTY_EDUCATION,
  });
  const [levelErrors, setLevelErrors] = useState<EducationErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);
    setLevelErrors({});

    if (
      !fullName.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !studentNo.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('All fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const errors = validateLevelFields(education);
    if (Object.keys(errors).length > 0) {
      setLevelErrors(errors);
      setError('Please complete your educational information.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await signUp(email.trim(), password, {
        full_name: fullName.trim(),
        phone: phone.trim(),
        student_no: studentNo.trim(),
        educational_level: education.educational_level ?? undefined,
        course: education.course.trim() || undefined,
        year_level: education.year_level.trim() || undefined,
        block: education.block.trim() || undefined,
        section: education.section.trim() || undefined,
        // NOTE: no role / is_active — public signups are always students.
      });

      if (authError) {
        setError(authError.message);
        toast.error(authError.message);
        return;
      }

      if (data.session) {
        toast.success('Account created successfully.');
        router.replace('/campus/events');
      } else {
        setSuccess(true);
        toast.success('Account created. Check your email to confirm.');
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected error. Please try again.';
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

            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Register to view events and record attendance
            </Text>

            {success ? (
              <View style={styles.successContainer}>
                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  We sent a confirmation link to {email}. Click the link to
                  verify your account, then come back and sign in.
                </Text>
                <Link href="/campus/login" style={styles.link}>
                  Back to Sign In
                </Link>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Juan Dela Cruz"
                  placeholderTextColor={COLORS.textSecondary}
                  editable={!loading}
                />

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

                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="09XXXXXXXXX"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="phone-pad"
                  editable={!loading}
                />

                <Text style={styles.label}>Student Number</Text>
                <TextInput
                  style={styles.input}
                  value={studentNo}
                  onChangeText={setStudentNo}
                  placeholder="e.g. 2026-000123"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="characters"
                  editable={!loading}
                />

                <View style={styles.educationSection}>
                  <EducationFields
                    value={education}
                    onChange={(next) => {
                      setEducation(next);
                      setLevelErrors({});
                    }}
                    errors={levelErrors}
                    disabled={loading}
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry
                  editable={!loading}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                <View style={styles.actionContainer}>
                  <BusyButton
                    title="Sign Up"
                    loadingTitle="Creating Account..."
                    icon="person-add-outline"
                    onPress={handleRegister}
                    loading={loading}
                  />
                </View>
              </View>
            )}

            {!success && (
              <Link href="/campus/login" style={styles.link}>
                Already have an account? Sign In
              </Link>
            )}
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
  educationSection: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
  successContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  successText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  link: {
    fontSize: 14,
    color: COLORS.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
