import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { setAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { EducationalLevel } from '@/types/database';

/**
 * CampusQR auth module.
 *
 * Uses the existing Supabase client (lib/supabase.ts) and mirrors every
 * auth change into the existing global auth store (lib/auth.ts setAuth)
 * so the pre-existing screens and the new CampusQR screens always agree
 * on whether a session exists. Existing files are only imported, never
 * modified.
 */

/** Signup metadata — NEVER includes role or is_active (DB hardcodes student). */
export type CampusSignUpMetadata = {
  full_name: string;
  phone?: string;
  student_no?: string;
  educational_level?: EducationalLevel;
  course?: string;
  year_level?: string;
  block?: string;
  section?: string;
};

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signUp(
  email: string,
  password: string,
  metadata: CampusSignUpMetadata
) {
  // No role / is_active in metadata — the handle_new_user trigger
  // hardcodes role = 'student' for every public signup.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signOut() {
  setAuth(null);
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Restores the persisted session on cold start and keeps it fresh
 * (auto-refresh is enabled on the client). Every change is mirrored
 * into the legacy global auth store.
 */
export function useCampusSession(): {
  session: Session | null;
  loading: boolean;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setAuth(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuth(nextSession);
      if (event === 'SIGNED_OUT') {
        setSession(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
