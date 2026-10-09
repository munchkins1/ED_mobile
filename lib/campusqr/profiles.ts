import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';
import {
  formatDepartment,
  formatGradeClass,
  type EducationValues,
} from './education';
import { suppressEcho } from './realtime';
import { refusedMessage, verifyPatch } from './verify';

/**
 * Profile data layer for the eleven self-editable columns. `role`,
 * `is_active` and `email` are never sent (column-level grants + RLS
 * would refuse them anyway — and we verify that they persisted).
 */

export type ProfileFormValues = {
  full_name: string;
  phone: string;
  student_no: string;
  title: string;
  education: EducationValues;
};

/**
 * Builds the patch for a profile save, including the denormalised
 * department (= course) and grade_class (formatGradeClass) columns.
 */
export function buildProfilePatch(
  values: ProfileFormValues
): Record<string, unknown> {
  return {
    full_name: values.full_name.trim(),
    phone: values.phone.trim() || null,
    student_no: values.student_no.trim() || null,
    title: values.title.trim() || null,
    educational_level: values.education.educational_level,
    course: values.education.course.trim() || null,
    year_level: values.education.year_level.trim() || null,
    block: values.education.block.trim() || null,
    section: values.education.section.trim() || null,
    department: formatDepartment(values.education.course),
    grade_class: formatGradeClass(values.education),
  };
}

/**
 * Saves the signed-in user's profile and re-reads the row: on a partial
 * refusal we report exactly which fields the database refused.
 */
export async function saveOwnProfile(
  userId: string,
  values: ProfileFormValues
): Promise<{ error: string | null; refused: string[] }> {
  const patch = buildProfilePatch(values);

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId);
  if (error) return { error: error.message, refused: [] };

  suppressEcho('profiles', userId);

  const { data: row } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const check = verifyPatch(row as Record<string, unknown> | null, patch);
  if (!check.ok) {
    return { error: refusedMessage(check.refused), refused: check.refused };
  }
  return { error: null, refused: [] };
}

/** Loads the signed-in user's profile row. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[campusqr/profiles] fetchProfile failed:', error.message);
    return null;
  }
  return data as Profile | null;
}
