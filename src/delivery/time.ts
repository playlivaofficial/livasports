import type { PageKey, SiteLocale } from '@/config/i18n';
import { getDictionary } from '@/config/i18n';

interface LocalDateParts { year: number; month: number; day: number; }
function dateParts(date: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}
function wallClockParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}
export function zonedDateTimeToUtc(parts: LocalDateParts & { hour?: number; minute?: number; second?: number }, timeZone: string): Date {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = wallClockParts(new Date(candidate), timeZone);
    candidate += desired - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  }
  return new Date(candidate);
}
export function localDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = dateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function localDayRange(date: Date, timeZone: string): { from: Date; to: Date } {
  const local = dateParts(date, timeZone);
  const nextProbe = new Date(Date.UTC(local.year, local.month - 1, local.day + 1, 12));
  const next = dateParts(nextProbe, timeZone);
  return { from: zonedDateTimeToUtc(local, timeZone), to: zonedDateTimeToUtc(next, timeZone) };
}
export function deliveryWindow(locale: SiteLocale, page: PageKey, now: Date): { from: Date; to: Date } {
  const day = localDayRange(now, getDictionary(locale).timeZone);
  if (page === 'home' || page === 'today') return day;
  if (page === 'live') return { from: new Date(now.getTime() - 86_400_000), to: new Date(now.getTime() + 86_400_000) };
  return { from: new Date(day.from.getTime() - 86_400_000), to: new Date(day.to.getTime() + 7 * 86_400_000) };
}
export function belongsToLocalDay(date: Date, reference: Date, timeZone: string): boolean { return localDateKey(date, timeZone) === localDateKey(reference, timeZone); }
