export const MIN_AGE = 13;

// Set for a day after someone enters a birth date under MIN_AGE.
export const AGE_BLOCK_COOKIE = "age_gate";

export interface BirthDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export function parseBirthDate(year: unknown, month: unknown, day: unknown): BirthDate | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects impossible dates such as February 30.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900) return null;
  return { year: y, month: m, day: d };
}

// True once the person has had their 13th birthday. Uses the calendar date
// in UTC, so someone turning 13 today may be told to come back tomorrow in
// some time zones; it never lets anyone in early by more than that day.
export function isAtLeast(birth: BirthDate, years: number, now: Date = new Date()): boolean {
  const y = now.getUTCFullYear() - birth.year;
  const beforeBirthday =
    now.getUTCMonth() + 1 < birth.month || (now.getUTCMonth() + 1 === birth.month && now.getUTCDate() < birth.day);
  return (beforeBirthday ? y - 1 : y) >= years;
}
