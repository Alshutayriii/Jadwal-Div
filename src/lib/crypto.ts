const APP = 'school-timetable-pro';
const ITERATIONS = 150_000;

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function fromBase64(text: string): Uint8Array {
  const str = atob(text);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** يُشفّر نصًا (نسخة احتياطية) بكلمة مرور ويعيد غلافًا JSON نصيًا. */
export async function encryptText(text: string, password: string): Promise<string> {
  if (!password || password.length < 6) throw new Error('كلمة مرور التشفير يجب أن تكون 6 أحرف على الأقل.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(text));
  return JSON.stringify({
    app: APP, encrypted: true, version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    salt: toBase64(salt), iv: toBase64(iv), data: toBase64(cipher), createdAt: new Date().toISOString(),
  });
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return Boolean(parsed && parsed.encrypted === true && parsed.data && parsed.salt && parsed.iv);
  } catch {
    return false;
  }
}

/** يفكّ تشفير النسخة ويعيد النص الأصلي. */
export async function decryptText(text: string, password: string): Promise<string> {
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('ملف النسخة غير صالح.'); }
  if (!parsed || parsed.encrypted !== true) throw new Error('الملف ليس نسخة مشفّرة.');
  const salt = fromBase64(parsed.salt);
  const iv = fromBase64(parsed.iv);
  const key = await deriveKey(password, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource }, key, fromBase64(parsed.data) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('كلمة المرور غير صحيحة أو الملف تالف.');
  }
}
