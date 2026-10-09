import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

/** Friendly empty state: "No events yet..." / "You have no attendance records yet." */
type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
};

export default function EmptyState({ icon, title, message }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={44} color={COLORS.textSecondary} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: 12,
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
});
