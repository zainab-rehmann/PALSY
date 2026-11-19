// PALSY — birthday helpers (migration 027). Pure functions, no I/O:
// the birthday is a plain `date` column on profiles, read through the
// profile selects the pages already make. A birthday is "today" when
// its month+day match today in LOCAL time — the stored value has no
// time part, so it is parsed as a local midnight, never as UTC.
export function isBirthdayToday(birthday: string | null | undefined): boolean {
  if (!birthday) return false;
  const d = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// "19 November" — the day + month, no year (a birthday banner never
// needs the year, and showing it would give away the age).
export function formatBirthday(birthday: string | null | undefined): string {
  if (!birthday) return '';
  const d = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
