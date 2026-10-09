import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';
import { getProfile, saveProfile, type Role } from './profiles';

export type SignUpProfile = {
  full_name: string;
  role: Role;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = false;
let listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}

function readSignUpMetadata(user: User): Partial<SignUpProfile> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const result: Partial<SignUpProfile> = {};

  if (typeof meta.full_name === 'string' && meta.full_name.trim()) {
    result.full_name = meta.full_name.trim();
  }

  if (meta.role === 'teacher' || meta.role === 'student') {
    result.role = meta.role;
  }

  return result;
}

/**
 * Makes sure the profile row matches the name/role chosen at sign-up.
 *
 * Supabase creates the auth user (and runs the profile trigger) before the
 * email is confirmed, and the client cannot write to the `profiles` table
 * until the user actually has a session. When confirmation is required we
 * therefore stash the chosen name/role in the user metadata at sign-up and
 * apply it here on the first sign-in.
 */
async function syncProfileFromMetadata(user: User) {
  const meta = readSignUpMetadata(user);

  // If nothing was captured at sign-up there is nothing to sync.
  if (!meta.full_name && !meta.role) {
    return;
  }

  const existing = await getProfile(user.id);
  const updates: { full_name?: string; role?: Role } = {};

  // Only fill a blank name — never overwrite a name the user edited later.
  if (meta.full_name && !existing?.full_name) {
    updates.full_name = meta.full_name;
  }

  // The role is chosen once at sign-up. If the trigger defaulted it to
  // 'student', correct it to the role the user actually selected.
  if (meta.role && existing?.role !== meta.role) {
    updates.role = meta.role;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await saveProfile(user.id, user.email, updates);
}

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Stash the chosen name/role so they survive the email-confirmation flow
    // and can be applied to the profile row once the user has a session.
    options: profile
      ? { data: { full_name: profile.full_name, role: profile.role } }
      : undefined,
  });

  if (!error && data.session && profile) {
    // Email confirmation is disabled, so a session is available right away and
    // the profile can be persisted immediately.
    await saveProfile(data.session.user.id, data.session.user.email, profile);
  }

  if (!error && data.session) {
    setAuth(data.session);
  }

  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!error && data.session) {
    // Apply the name/role captured during sign-up. This covers the email
    // confirmation flow, where the profile row was created with defaults.
    await syncProfileFromMetadata(data.session.user);
    setAuth(data.session);
  }
  return { data, error };
}

export async function signOut() {
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  return { error: null };
}