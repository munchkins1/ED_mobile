import { Redirect, Stack, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ToastProvider } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { useCampusSession } from '@/lib/campusqr/auth';
import { defaultTabFor, useCampusRole } from '@/lib/campusqr/roles';

/**
 * CampusQR area: auth guard + role-aware navigation (spec section 1).
 * Unauthenticated users are always sent to Login; authenticated users on
 * an auth screen are sent to their role's default tab. This layout only
 * registers NEW routes — no existing file is modified.
 */
function CampusNavigator() {
  const { session, loading } = useCampusSession();
  const { role, loading: roleLoading } = useCampusRole();
  const segments = useSegments();

  if (loading || (session && roleLoading)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Segments look like ['campus', 'login'] / ['campus', '(tabs)', ...].
  // Cast: expo-router narrows the tuple type for this layout's depth.
  const parts = (segments ?? []) as string[];
  const sub = parts[1];
  const inAuth = sub === 'login' || sub === 'register';

  if (!session && !inAuth) {
    return <Redirect href="/campus/login" />;
  }
  if (session && inAuth) {
    return <Redirect href={defaultTabFor(role)} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="event-form" />
      <Stack.Screen name="qr-display" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function CampusLayout() {
  return (
    <ToastProvider>
      <CampusNavigator />
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
