import { supabase } from '@/lib/supabase';
import type {
  AdminRpcResult,
  Profile,
  UserRole,
} from '@/types/database';
import { refusedMessage, verifyPatch } from './verify';
import { suppressEcho } from './realtime';

/**
 * Admin data layer (spec section 3): user management through the admin
 * RPCs plus profile updates that are verified by re-reading the row.
 */

const PROFILE_COLUMNS =
  'id, email, full_name, role, student_no, grade_class, department, title, phone, is_active, created_at, educational_level, course, year_level, block, section';

/** Lists all users, optionally filtered by a search keyword. */
export async function listUsers(search?: string): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('created_at', { ascending: false });

  const keyword = (search ?? '').trim();
  if (keyword) {
    query = query.or(
      `full_name.ilike.%${keyword}%,email.ilike.%${keyword}%,student_no.ilike.%${keyword}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[campusqr/admin] listUsers failed:', error.message);
    return [];
  }
  return (data as Profile[]) ?? [];
}

/**
 * Updates another user's profile fields (the eleven editable columns)
 * and re-reads the row: if the database silently refused part of the
 * patch we report exactly which fields did not persist.
 */
export async function updateUser(
  id: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null; refused: string[] }> {
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id);
  if (error) return { error: error.message, refused: [] };

  suppressEcho('profiles', id);

  const { data: row } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const check = verifyPatch(row as Record<string, unknown> | null, patch);
  if (!check.ok) {
    return {
      error: refusedMessage(check.refused),
      refused: check.refused,
    };
  }
  return { error: null, refused: [] };
}

/** Changes a user's role via rpc('admin_set_role'). */
export async function setRole(
  userId: string,
  role: UserRole
): Promise<AdminRpcResult> {
  const { data, error } = await supabase.rpc('admin_set_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) return { result: 'error', message: error.message };
  const result = data as AdminRpcResult;
  if (result.result === 'success') suppressEcho('profiles', userId);
  return result;
}

/** Activates/deactivates an account via rpc('admin_set_active'). */
export async function setActive(
  userId: string,
  active: boolean
): Promise<AdminRpcResult> {
  const { data, error } = await supabase.rpc('admin_set_active', {
    p_user_id: userId,
    p_active: active,
  });
  if (error) return { result: 'error', message: error.message };
  const result = data as AdminRpcResult;
  if (result.result === 'success') suppressEcho('profiles', userId);
  return result;
}

/** Deletes a user via rpc('admin_delete_user'). */
export async function deleteUser(userId: string): Promise<AdminRpcResult> {
  const { data, error } = await supabase.rpc('admin_delete_user', {
    p_user_id: userId,
  });
  if (error) return { result: 'error', message: error.message };
  const result = data as AdminRpcResult;
  if (result.result === 'success') suppressEcho('profiles', userId);
  return result;
}
