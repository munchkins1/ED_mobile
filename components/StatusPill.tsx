import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import type { AttendanceStatus, EventStatus, UserRole } from '@/types/database';

/**
 * Status pill badges shared by every CampusQR screen.
 * Visual language: emerald=success/open, amber=warning/draft,
 * rose=error, indigo=info.
 */

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_STYLES: Record<
  PillTone,
  { bg: string; fg: string }
> = {
  success: { bg: '#E7F6EE', fg: COLORS.success },
  warning: { bg: '#FEF3E2', fg: COLORS.warning },
  danger: { bg: '#FDECEC', fg: COLORS.danger },
  info: { bg: '#E8EDFB', fg: COLORS.primary },
  neutral: { bg: COLORS.surface, fg: COLORS.textSecondary },
};

export function eventStatusTone(status: EventStatus): PillTone {
  switch (status) {
    case 'open':
      return 'success';
    case 'draft':
      return 'warning';
    case 'closed':
      return 'neutral';
  }
}

export function attendanceStatusTone(status: AttendanceStatus): PillTone {
  switch (status) {
    case 'present':
      return 'success';
    case 'late':
      return 'warning';
    case 'absent':
      return 'danger';
    case 'excused':
      return 'info';
  }
}

export function roleTone(role: UserRole): PillTone {
  switch (role) {
    case 'admin':
      return 'danger';
    case 'teacher':
      return 'info';
    case 'student':
      return 'neutral';
  }
}

type Props = {
  label: string;
  tone?: PillTone;
};

export default function StatusPill({ label, tone = 'neutral' }: Props) {
  const palette = TONE_STYLES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
