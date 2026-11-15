/** تجزئة كلمات المرور محليًا — PBKDF2-HMAC-SHA256 عبر WebCrypto. */

const ITERATIONS = 150000;

export const DEMO_USERS = [
  { name: 'مدير النظام', username: 'admin', password: 'admin123', role: 'system_admin' as const, teacher_id: null },
  { name: 'خالد بن سعد الحربي', username: 'principal', password: 'principal123', role: 'principal' as const, teacher_id: null },
  { name: 'عبدالعزيز بن ناصر', username: 'vice', password: 'vice123', role: 'vice' as const, teacher_id: null },
  { name: 'مسؤول الجدول', username: 'scheduler', password: 'scheduler123', role: 'scheduler' as const, teacher_id: null },
  { name: 'معلم تجريبي', username: 'teacher', password: 'teacher123', role: 'teacher' as const, teacher_id: 1 },
];

const enc = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('التجزئة الآمنة تتطلب HTTPS أو localhost. افتح التطبيق عبر نطاق آمن.');
  }
  return globalThis.crypto.subtle;
}

async function derive(password: string, salt: any, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `p1$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export async function verifyPassword(password: string, stored?: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'p1') return false;
  const iterations = Number(parts[1]);
  if (!iterations) return false;
  const salt = hexToBytes(parts[2]);
  const expected = parts[3];
  const actual = bytesToHex(await derive(password, salt, iterations));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
