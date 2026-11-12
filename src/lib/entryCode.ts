// PALSY — optional room entry codes.
// Codes are short and friendly: 4-8 letters/digits, stored uppercase,
// case-insensitive when typed. The code itself is never stored or read
// by clients — only a bcrypt hash lives in the database, checked by a
// server-side function that returns true/false.

// Confusion-free alphabet: no 0/O, 1/I/L.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function normalizeEntryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidEntryCode(code: string): boolean {
  const c = normalizeEntryCode(code);
  return c.length >= 4 && c.length <= 8;
}

export function generateEntryCode(): string {
  let out = '';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}
