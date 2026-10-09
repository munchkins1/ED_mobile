import Dropdown from '@/components/Dropdown';
import {
  BLOCK_OPTIONS,
  EMPTY_EDUCATION,
  LEVEL_OPTIONS,
  levelFields,
  toOptions,
  type EducationErrors,
  type EducationValues,
} from '@/lib/campusqr/education';
import type { EducationalLevel } from '@/types/database';

type Props = {
  value: EducationValues;
  onChange: (next: EducationValues) => void;
  errors?: EducationErrors;
  disabled?: boolean;
  /** Prefix for dropdown accessibility labels (shared forms). */
  idPrefix?: string;
};

/**
 * The Educational Level dropdown that conditionally reveals fields:
 * College -> course + year 1-4 + block A-F;
 * Senior High -> track + grade 11-12 + section;
 * Junior High -> grade 7-10 + section;
 * Elementary -> grade 1-6 + section.
 * Shared by Register, Profile and the admin Manage Users modal.
 */
export default function EducationFields({
  value,
  onChange,
  errors = {},
  disabled = false,
}: Props) {
  const fields = levelFields(value.educational_level);

  const patch = (partial: Partial<EducationValues>) =>
    onChange({ ...value, ...partial });

  const selectLevel = (level: string) => {
    // Reset dependent fields when the level changes.
    onChange({
      ...EMPTY_EDUCATION,
      educational_level: (level || null) as EducationalLevel | null,
    });
  };

  return (
    <>
      <Dropdown
        label="Educational Level"
        value={value.educational_level ?? ''}
        placeholder="Select educational level"
        options={[
          { label: 'Select...', value: '' },
          ...LEVEL_OPTIONS.map((level) => ({
            label: level.label,
            value: level.value,
          })),
        ]}
        onChange={selectLevel}
        disabled={disabled}
        error={
          errors.course && !value.educational_level ? errors.course : undefined
        }
      />

      {fields.needsCourse && (
        <Dropdown
          label={fields.courseLabel}
          value={value.course}
          placeholder={`Select ${fields.courseLabel.toLowerCase()}`}
          options={toOptions(fields.courseOptions, 'Select...')}
          onChange={(course) => patch({ course })}
          disabled={disabled}
          error={errors.course}
        />
      )}

      {fields.needsYear && (
        <Dropdown
          label={fields.yearLabel}
          value={value.year_level}
          placeholder={`Select ${fields.yearLabel.toLowerCase()}`}
          options={toOptions(fields.yearOptions, 'Select...')}
          onChange={(year_level) => patch({ year_level })}
          disabled={disabled}
          error={errors.year_level}
        />
      )}

      {fields.needsBlock && (
        <Dropdown
          label="Block"
          value={value.block}
          placeholder="Select block"
          options={toOptions(BLOCK_OPTIONS, 'Select...')}
          onChange={(block) => patch({ block })}
          disabled={disabled}
          error={errors.block}
        />
      )}

      {fields.needsSection && (
        <Dropdown
          label="Section"
          value={value.section}
          placeholder="Select section"
          options={toOptions(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 'Select...')}
          onChange={(section) => patch({ section })}
          disabled={disabled}
          error={errors.section}
        />
      )}
    </>
  );
}
