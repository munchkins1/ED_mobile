import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';

/**
 * Busy button with spinner label (spec: busy buttons with spinner label).
 * Same visual language as the existing AppButton, but with a loading
 * state — new component, existing files untouched.
 */
type Props = {
  title: string;
  loadingTitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  theme?: 'primary' | 'secondary';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export default function BusyButton({
  title,
  loadingTitle,
  icon,
  theme = 'primary',
  onPress,
  loading = false,
  disabled = false,
}: Props) {
  const isDisabled = disabled || loading;
  const primary = theme === 'primary';

  return (
    <View style={styles.outer}>
      <Pressable
        style={[
          styles.inner,
          primary ? styles.primaryFill : styles.secondaryFill,
          isDisabled && styles.disabled,
        ]}
        onPress={onPress}
        disabled={isDisabled}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={primary ? '#FFFFFF' : COLORS.primary}
            style={styles.icon}
          />
        ) : icon ? (
          <Ionicons
            name={icon}
            size={22}
            color={primary ? '#FFFFFF' : COLORS.textSecondary}
            style={styles.icon}
          />
        ) : null}
        <Text
          style={[
            styles.label,
            primary ? styles.primaryLabel : styles.secondaryLabel,
          ]}
        >
          {loading ? loadingTitle ?? 'Working...' : title}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    marginBottom: 14,
  },
  inner: {
    minHeight: 48,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryFill: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  secondaryFill: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  icon: {
    paddingRight: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryLabel: {
    color: COLORS.textPrimary,
  },
  disabled: {
    opacity: 0.55,
  },
});
