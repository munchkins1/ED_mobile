import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { useAuth } from './auth';
import { getProfile, type Role } from './profiles';

/**
 * Reads the role chosen at sign-up straight from the auth session metadata.
 *
 * This is available immediately (no network round trip) and works even when the
 * `profiles` table cannot be queried, so it is used both as an instant value
 * and as a fallback for the database role.
 */
export function roleFromMetadata(user: User | null): Role | null {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return meta.role === 'teacher' || meta.role === 'student' ? meta.role : null;
}

export type RoleState = {
  /** The resolved role, or null while it is still being determined. */
  role: Role | null;
  isTeacher: boolean;
  isStudent: boolean;
  loading: boolean;
  /** Re-runs the lookup (e.g. after the profile was changed elsewhere). */
  refresh: () => void;
};

/**
 * Resolves the current user's role.
 *
 * The `profiles` table is the source of truth, but the role stored in the
 * session metadata at sign-up is used as an immediate value and as a fallback.
 * That keeps the Teacher tab / profile badge correct even if the database row
 * is missing or temporarily unreadable.
 */
export function useRole(): RoleState {
  const { user } = useAuth();
  const [role, setRole] = useState<Role | null>(() => roleFromMetadata(user));
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    if (!user) {
      setRole(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    // Show the role from the session right away.
    const metaRole = roleFromMetadata(user);
    setRole(metaRole);
    setLoading(true);

    // Then confirm against the profile row (the source of truth).
    getProfile(user.id)
      .then((profile) => {
        if (!active) return;
        setRole(profile?.role ?? metaRole ?? 'student');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, reloadKey]);

  const refresh = useCallback(() => setReloadKey((n) => n + 1), []);

  return {
    role,
    isTeacher: role === 'teacher',
    isStudent: role === 'student',
    loading,
    refresh,
  };
}