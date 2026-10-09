import { router } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';

export default function Index() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Header title="QR Attendance" />
      </View>

      <View style={styles.bodyContainer}>
        <Text style={styles.mainTitle}>School Event Attendance</Text>
        <Text style={styles.subtitle}>
          Scan QR Codes to record attendance during school activities.
        </Text>
        <Text style={styles.developerText}>Developed by: Leonard V. Abatayo</Text>
      </View>

      <View style={styles.footerContainer}>
        <AppButton
          theme="primary"
          title="Scan QR Code"
          icon="qr-code-outline"
          onPress={() => router.push('/scan')}
        />
        <AppButton
          title="Attendance History"
          icon="time-outline"
          onPress={() => router.push('/history')}
        />
        <AppButton
          title="Profile"
          icon="person-outline"
          onPress={() => router.push('/profile')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  headerContainer: {
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  bodyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 16,
  },
  developerText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  footerContainer: {
    flex: 1.2,
    alignItems: 'center',
    width: '100%',
    paddingBottom: 24,
    justifyContent: 'flex-end',
  },
});