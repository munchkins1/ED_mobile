import { supabase } from './supabase';

export type Role = 'student' | 'teacher';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      // Surface the real cause (e.g. an RLS policy error) instead of failing
      // silently, which previously made the profile look empty.
      console.warn('[profiles] getProfile failed:', error.message);
    }
    return null;
  }

  return data as Profile;
}

export type ProfileUpdates = {
  full_name?: string;
  role?: Role;
};

/**
 * Creates or updates a user's profile row.
 *
 * Uses an upsert keyed on `id` so that:
 *  - the row is created on the first save even if the sign-up trigger did not
 *    create it, and
 *  - subsequent saves update the existing row.
 */
export async function saveProfile(
  userId: string,
  email: string | null | undefined,
  updates: ProfileUpdates
): Promise<{ error: string | null }> {
  const payload: { id: string; email?: string } & ProfileUpdates = {
    id: userId,
    ...updates,
  };

  if (email) {
    payload.email = email;
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' });

  return { error: error?.message ?? null };
}
