import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';

export type DropdownOption = { label: string; value: string };

type Props = {
  label?: string;
  value: string;
  placeholder?: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
};

/**
 * Simple modal dropdown built from core RN primitives (no new
 * dependencies). Touch targets are at least 44dp.
 */
export default function Dropdown({
  label,
  value,
  placeholder = 'Select...',
  options,
  onChange,
  disabled = false,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const display = selected ? selected.label : placeholder;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.field, disabled && styles.disabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Text
          style={[styles.value, !selected && styles.placeholder]}
          numberOfLines={1}
        >
          {display}
        </Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={COLORS.textSecondary}
        />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label ?? placeholder}</Text>
            <ScrollView style={styles.list} bounces={false}>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value || '__placeholder'}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.optionText,
                        active && styles.optionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {active ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={COLORS.primary}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Pressable
              style={styles.closeButton}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  field: {
    minHeight: 48,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  disabled: {
    opacity: 0.6,
  },
  value: {
    fontSize: 16,
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  placeholder: {
    color: COLORS.textSecondary,
  },
  error: {
    fontSize: 13,
    color: COLORS.danger,
    marginTop: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 12,
    maxHeight: '75%',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  optionActive: {
    backgroundColor: `${COLORS.primary}10`,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.textPrimary,
    flex: 1,
  },
  optionTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  closeButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 4,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
