import type { EducationalLevel, Profile } from '@/types/database';

/**
 * Single shared definition of educational levels, their fields, validation
 * and the denormalised grade_class / department formatting. Used by the
 * Register screen, the Profile screen and the admin Manage Users modal.
 */

export type LevelOption = {
  value: EducationalLevel;
  label: string;
};

export const LEVEL_OPTIONS: LevelOption[] = [
  { value: 'college', label: 'College' },
  { value: 'senior_high', label: 'Senior High' },
  { value: 'junior_high', label: 'Junior High' },
  { value: 'elementary', label: 'Elementary' },
];

/** College courses. */
export const COURSE_OPTIONS = [
  'BS Information Technology',
  'BS Computer Science',
  'BS Education',
  'BS Nursing',
  'BS Business Administration',
] as const;

/** Senior High tracks. */
export const TRACK_OPTIONS = ['STEM', 'ABM', 'TVL', 'HUMSS'] as const;

export const YEAR_LEVEL_OPTIONS = ['1', '2', '3', '4'] as const;
export const SENIOR_GRADE_OPTIONS = ['11', '12'] as const;
export const JUNIOR_GRADE_OPTIONS = ['7', '8', '9', '10'] as const;
export const ELEMENTARY_GRADE_OPTIONS = ['1', '2', '3', '4', '5', '6'] as const;
export const BLOCK_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** The education fields collected per level (besides the shared ones). */
export type EducationValues = {
  educational_level: EducationalLevel | null;
  /** College course / Senior High track (stored in the course column). */
  course: string;
  year_level: string;
  block: string;
  section: string;
};

export const EMPTY_EDUCATION: EducationValues = {
  educational_level: null,
  course: '',
  year_level: '',
  block: '',
  section: '',
};

/** Which inputs a level requires — drives conditional field visibility. */
export type LevelFields = {
  needsCourse: boolean;
  courseLabel: string;
  courseOptions: readonly string[];
  needsYear: boolean;
  yearLabel: string;
  yearOptions: readonly string[];
  needsBlock: boolean;
  needsSection: boolean;
};

export function levelFields(level: EducationalLevel | null): LevelFields {
  switch (level) {
    case 'college':
      return {
        needsCourse: true,
        courseLabel: 'Course',
        courseOptions: COURSE_OPTIONS,
        needsYear: true,
        yearLabel: 'Year Level',
        yearOptions: YEAR_LEVEL_OPTIONS,
        needsBlock: true,
        needsSection: false,
      };
    case 'senior_high':
      return {
        needsCourse: true,
        courseLabel: 'Track',
        courseOptions: TRACK_OPTIONS,
        needsYear: true,
        yearLabel: 'Grade',
        yearOptions: SENIOR_GRADE_OPTIONS,
        needsBlock: false,
        needsSection: true,
      };
    case 'junior_high':
      return {
        needsCourse: false,
        courseLabel: 'Track',
        courseOptions: [],
        needsYear: true,
        yearLabel: 'Grade',
        yearOptions: JUNIOR_GRADE_OPTIONS,
        needsBlock: false,
        needsSection: true,
      };
    case 'elementary':
      return {
        needsCourse: false,
        courseLabel: 'Track',
        courseOptions: [],
        needsYear: true,
        yearLabel: 'Grade',
        yearOptions: ELEMENTARY_GRADE_OPTIONS,
        needsBlock: false,
        needsSection: true,
      };
    default:
      return {
        needsCourse: false,
        courseLabel: 'Course',
        courseOptions: [],
        needsYear: false,
        yearLabel: 'Year Level',
        yearOptions: [],
        needsBlock: false,
        needsSection: false,
      };
  }
}

export type EducationErrors = Partial<
  Record<'course' | 'year_level' | 'block' | 'section', string>
>;

/**
 * Required fields and valid ranges per level — the equivalent of
 * validateLevelFields from the spec. Returns an empty object when valid.
 */
export function validateLevelFields(values: EducationValues): EducationErrors {
  const errors: EducationErrors = {};
  const level = values.educational_level;

  if (!level) {
    return { course: 'Please select an educational level.' };
  }

  const fields = levelFields(level);

  if (fields.needsCourse && !values.course.trim()) {
    errors.course = `Please select ${fields.courseLabel.toLowerCase()}.`;
  }

  if (fields.needsYear) {
    const year = values.year_level.trim();
    if (!year) {
      errors.year_level = `Please select ${fields.yearLabel.toLowerCase()}.`;
    } else if (!fields.yearOptions.includes(year)) {
      errors.year_level = `${fields.yearLabel} must be ${fields.yearOptions.join(
        ', '
      )}.`;
    }
  }

  if (fields.needsBlock && !values.block.trim()) {
    errors.block = 'Please select a block.';
  }

  if (fields.needsSection && !values.section.trim()) {
    errors.section = 'Please enter a section.';
  }

  return errors;
}

/**
 * Builds the denormalised grade_class column, e.g. "Year 3 - Block A".
 */
export function formatGradeClass(values: EducationValues): string | null {
  const level = values.educational_level;
  if (!level) return null;

  switch (level) {
    case 'college': {
      if (!values.year_level) return null;
      const year = `Year ${values.year_level}`;
      return values.block ? `${year} - Block ${values.block}` : year;
    }
    case 'senior_high': {
      if (!values.year_level) return null;
      const grade = `Grade ${values.year_level}`;
      const track = values.course ? ` - ${values.course}` : '';
      const section = values.section ? ` - ${values.section}` : '';
      return `${grade}${track}${section}`;
    }
    case 'junior_high':
    case 'elementary': {
      if (!values.year_level) return null;
      const grade = `Grade ${values.year_level}`;
      const section = values.section ? ` - ${values.section}` : '';
      return `${grade}${section}`;
    }
  }
}

/** department mirrors course (empty string -> null). */
export function formatDepartment(
  course: string | null | undefined
): string | null {
  const trimmed = (course ?? '').trim();
  return trimmed ? trimmed : null;
}

/** Reads a profile row into the education form shape. */
export function educationFromProfile(profile: Profile | null): EducationValues {
  if (!profile) return { ...EMPTY_EDUCATION };
  return {
    educational_level: profile.educational_level,
    course: profile.course ?? '',
    year_level: profile.year_level ?? '',
    block: profile.block ?? '',
    section: profile.section ?? '',
  };
}

/** Options for a dropdown, derived from a readonly list of strings. */
export function toOptions(
  values: readonly string[],
  placeholder?: string
): { label: string; value: string }[] {
  const options = values.map((value) => ({ label: value, value }));
  return placeholder
    ? [{ label: placeholder, value: '' }, ...options]
    : options;
}
