import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/database';

/** Human labels for each role. */
export const ROLE_LABEL: Record<UserRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Administrator',
};

/** Fetches the full CampusQR profile row for a user. */
export async function getCurrentProfile(
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[campusqr/roles] getCurrentProfile failed:', error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

/** True when the role is one of the allowed roles. */
export function requireRole(
  role: UserRole | null | undefined,
  allowed: UserRole[]
): boolean {
  return role !== null && role !== undefined && allowed.includes(role);
}

/** The default tab for each role after login. */
export function defaultTabFor(role: UserRole | null): string {
  switch (role) {
    case 'admin':
      return '/campus/manage-users';
    case 'teacher':
      return '/campus/events';
    default:
      return '/campus/events';
  }
}

export type CampusRoleState = {
  profile: Profile | null;
  role: UserRole | null;
  isStudent: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  loading: boolean;
  refresh: () => void;
};

/**
 * Resolves the signed-in user's profile and role. The `profiles` table is
 * the source of truth (signup metadata never carries a role).
 */
export function useCampusRole(): CampusRoleState {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    if (!user) {
      setProfile(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    getCurrentProfile(user.id)
      .then((row) => {
        if (active) setProfile(row);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, reloadKey]);

  const refresh = useCallback(() => setReloadKey((n) => n + 1), []);

  const role = profile?.role ?? null;
  return {
    profile,
    role,
    isStudent: role === 'student',
    isTeacher: role === 'teacher',
    isAdmin: role === 'admin',
    isStaff: role === 'teacher' || role === 'admin',
    loading,
    refresh,
  };
}
