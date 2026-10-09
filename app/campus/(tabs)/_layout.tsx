import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COLORS } from '@/constants/colors';
import { useCampusRole } from '@/lib/campusqr/roles';

/**
 * Role-based bottom tabs (spec section 1). Screens a role cannot access
 * are never rendered as tabs (href: null). Grows phase by phase:
 *   Phase 3: Events (+ Manage Events for staff)
 *   Phase 4: Scan QR
 *   Phase 5: My Attendance / Monitor / Correct
 *   Phase 6: Manage Users + System Reports
 *   Phase 7: Profile (+ teacher Summaries via Reports)
 */
export default function CampusTabsLayout() {
  const { role, loading } = useCampusRole();

  if (loading) {
    return null;
  }

  const isStaff = role === 'teacher' || role === 'admin';
  const isAdmin = role === 'admin';
  // Unknown/loading-out role (e.g. no profile row yet) — show student tabs.
  const isStudent = !isStaff;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        headerStyle: { backgroundColor: COLORS.background },
        headerShadowVisible: false,
        headerTintColor: COLORS.textPrimary,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="events"
        options={{
          title: isStaff ? 'Manage Events' : 'Events',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan QR',
          href: isStudent ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'qr-code' : 'qr-code-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="my-attendance"
        options={{
          title: 'My Attendance',
          href: isStudent ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="monitor-attendance"
        options={{
          title: 'Monitor',
          href: isStaff ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="correct-records"
        options={{
          title: 'Correct',
          href: role === 'admin' ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'create' : 'create-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="manage-users"
        options={{
          title: 'Users',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'shield' : 'shield-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: isAdmin ? 'Reports' : 'Summaries',
          href: isStaff ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'bar-chart' : 'bar-chart-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
