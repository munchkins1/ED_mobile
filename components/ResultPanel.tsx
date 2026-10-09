import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

export type ResultTone = 'success' | 'error' | 'warning' | 'info';

const TONES: Record<ResultTone, { bg: string; border: string; fg: string }> = {
  success: { bg: '#E7F6EE', border: COLORS.success, fg: COLORS.success },
  error: { bg: '#FDECEC', border: COLORS.danger, fg: COLORS.danger },
  warning: { bg: '#FEF3E2', border: COLORS.warning, fg: COLORS.warning },
  info: { bg: '#E8EDFB', border: COLORS.primary, fg: COLORS.primary },
};

type Props = {
  tone: ResultTone;
  title?: string;
  message: string;
  children?: React.ReactNode;
};

/**
 * Persistent result panel (spec UX): shown after a scan while the
 * scanner stays stopped; carries the exact result copy plus actions
 * (e.g. the "Scan again" button rendered by the caller).
 */
export default function ResultPanel({ tone, title, message, children }: Props) {
  const palette = TONES[tone];
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      {title ? (
        <Text style={[styles.title, { color: palette.fg }]}>{title}</Text>
      ) : null}
      <Text style={styles.message}>{message}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
});
