/** Shared date/number formatting for the CampusQR screens. */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}
