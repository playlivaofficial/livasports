/** Sportmonks v3 defaults to UTC; never let a worker's local timezone interpret it. */
export function sportmonksUtc(value: string, unixSeconds?: number): Date {
  if (typeof unixSeconds === 'number' && Number.isFinite(unixSeconds) && unixSeconds > 0) return new Date(unixSeconds * 1000);
  const iso = value.trim().replace(' ', 'T');
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid Sportmonks UTC timestamp');
  return date;
}
