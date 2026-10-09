import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import BusyButton from '@/components/BusyButton';
import LockedView from '@/components/LockedView';
import ResultPanel, { type ResultTone } from '@/components/ResultPanel';
import { useToast } from '@/components/CampusToast';
import { COLORS } from '@/constants/colors';
import { checkIn } from '@/lib/campusqr/attendance';
import { useCampusRole } from '@/lib/campusqr/roles';
import type { CheckInResult, CheckInResultType } from '@/types/database';

const RESULT_TONE: Record<CheckInResultType, ResultTone> = {
  success: 'success',
  duplicate: 'warning',
  closed: 'warning',
  invalid: 'error',
  unauthorized: 'error',
};

const RESULT_TITLE: Record<CheckInResultType, string> = {
  success: 'Check-in complete',
  duplicate: 'Already checked in',
  closed: 'Event closed',
  invalid: 'Invalid QR code',
  unauthorized: 'Not allowed',
};

type Phase = 'camera' | 'manual';

export default function CampusScanScreen() {
  const { role, loading: roleLoading } = useCampusRole();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('camera');
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const handlingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    handlingRef.current = false;
  }, []));

  const handleRawScan = async (raw: string) => {
    if (handlingRef.current || busy) return;
    handlingRef.current = true;
    setBusy(true);
    try {
      const outcome = await checkIn(raw);
      setResult(outcome);
      const kind =
        outcome.result === 'success' ? 'success'
        : outcome.result === 'duplicate' || outcome.result === 'closed'
          ? 'warning' : 'error';
      toast.show(kind, outcome.message);
    } finally {
      setBusy(false);
    }
  };

  const handleScanAgain = () => {
    setResult(null);
    setManualCode('');
    handlingRef.current = false;
  };

  if (!roleLoading && role !== null && role !== 'student') {
    return <LockedView message="Only student accounts can record attendance." />;
  }

  if (!roleLoading && permission && !permission.granted && phase === 'camera') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={48} color={COLORS.textSecondary} />
          <Text style={styles.title}>Camera Permission Needed</Text>
          <Text style={styles.subtitle}>We need access to your camera to scan QR codes. You can also enter the event code manually.</Text>
          <BusyButton title="Grant Permission" loadingTitle="Requesting..." icon="camera-outline" onPress={() => requestPermission()} loading={false} />
          <Pressable style={styles.linkButton} onPress={() => setPhase('manual')}>
            <Text style={styles.linkText}>Enter event code manually</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const scannerStopped = result !== null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Scan QR</Text>
          <Text style={styles.subtitle}>Point your camera at the event QR code, or enter the event code.</Text>
          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentButton, phase === 'camera' && styles.segmentActive]}
              onPress={() => { setPhase('camera'); handleScanAgain(); }}>
              <Text style={[styles.segmentText, phase === 'camera' && styles.segmentTextActive]}>Camera</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, phase === 'manual' && styles.segmentActive]}
              onPress={() => { setPhase('manual'); handleScanAgain(); }}>
              <Text style={[styles.segmentText, phase === 'manual' && styles.segmentTextActive]}>Manual code</Text>
            </Pressable>
          </View>
          {phase === 'camera' ? (
            <View style={styles.cameraBox}>
              {!scannerStopped ? (
                <CameraView style={styles.camera} facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => handleRawScan(data)} />
              ) : (
                <View style={styles.cameraPaused}>
                  <Ionicons name="pause-circle-outline" size={44} color={COLORS.textSecondary} />
                  <Text style={styles.hint}>Scanner paused — see your result below.</Text>
                </View>
              )}
              <Text style={styles.hint}>Point your camera at a QR code</Text>
            </View>
          ) : (
            <View style={styles.manualBox}>
              <Text style={styles.label}>Event code</Text>
              <TextInput style={styles.input} value={manualCode} onChangeText={setManualCode}
                placeholder="CAMPUSQR:<token> or paste the token"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="none" editable={!busy && !scannerStopped} />
              <BusyButton title="Check In" loadingTitle="Checking In..." icon="checkmark-outline"
                onPress={() => manualCode.trim() && handleRawScan(manualCode)}
                loading={busy} disabled={!manualCode.trim() || scannerStopped} />
            </View>
          )}
          {busy && !result && <Text style={styles.hint}>Recording attendance...</Text>}
          {result && (
            <View style={styles.resultWrap}>
              <ResultPanel tone={RESULT_TONE[result.result]} title={RESULT_TITLE[result.result]} message={result.message}>
                <Pressable style={styles.secondaryButton} onPress={handleScanAgain}>
                  <Ionicons name="refresh-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.secondaryText}>Scan again</Text>
                </Pressable>
              </ResultPanel>
            </View>
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
  title: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  permissionBox: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  linkButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  linkText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  segment: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, padding: 4, marginBottom: 16,
  },
  segmentButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: COLORS.primary },
  segmentText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  segmentTextActive: { color: '#FFFFFF' },
  cameraBox: { alignItems: 'center', gap: 10, marginBottom: 16 },
  camera: { width: '100%', height: 320, borderRadius: 14, overflow: 'hidden' },
  cameraPaused: {
    width: '100%', height: 320, borderRadius: 14, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  hint: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  manualBox: { width: '100%', marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.textPrimary, marginBottom: 12,
  },
  resultWrap: { width: '100%', marginTop: 8 },
  secondaryButton: {
    minHeight: 44, marginTop: 12, flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
});
