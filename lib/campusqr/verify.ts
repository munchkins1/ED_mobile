/**
 * Write verification helpers.
 *
 * Spec rule: never trust a write response alone — after an update, re-read
 * the row to confirm it changed (an RLS-blocked or column-grant-blocked
 * update silently affects 0 rows) and report exactly which fields the
 * database refused.
 */

export type VerifyResult = {
  ok: boolean;
  /** Patch fields whose persisted value does not match what we sent. */
  refused: string[];
};

function normalize(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * Compares the values we tried to write against the row we re-read.
 * `row === null` means the row is gone or invisible to us — everything
 * in the patch counts as refused.
 */
export function verifyPatch(
  row: Record<string, unknown> | null,
  patch: Record<string, unknown>
): VerifyResult {
  const keys = Object.keys(patch).filter(
    (key) => patch[key] !== undefined
  );

  if (row === null) {
    return { ok: false, refused: keys };
  }

  const refused = keys.filter(
    (key) => normalize(row[key]) !== normalize(patch[key])
  );
  return { ok: refused.length === 0, refused };
}

/** Human message for a failed verification. */
export function refusedMessage(refused: string[]): string {
  if (refused.length === 0) {
    return 'The database refused this update.';
  }
  return `The database refused: ${refused.join(', ')}.`;
}
