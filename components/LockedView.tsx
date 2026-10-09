import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

/**
 * Shown on screens a role cannot access. Combined with hidden tabs this
 * keeps role gating airtight even for deep links (spec section 2).
 */
type Props = {
  title?: string;
  message?: string;
};

export default function LockedView({
  title = 'Access Restricted',
  message = 'Your account does not have access to this screen.',
}: Props) {
  return (
    <View style={styles.container}>
      <Ionicons
        name="lock-closed-outline"
        size={48}
        color={COLORS.textSecondary}
        style={styles.icon}
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
