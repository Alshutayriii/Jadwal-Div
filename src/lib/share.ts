import type { DB } from '../types';
import { activeSchedule, fmtDate, scheduleLessons } from './model';

export interface SectionShare {
  json: string;
  /** نص مختصر قابل لحفظه في رمز QR (مضغوط ثم Base64). */
  qr: string;
  text: string;
  title: string;
  fileName: string;
  size: number;
  qrSize: number;
  compressed: boolean;
  cells: number;
}

export interface SectionPayload {
  v: number;
  a: string;
  n: string;
  y: string;
  t: string;
  g: string;
  s: string;
  d: string[];
  p: string[];
  c: Array<[number, number, string, string, string]>;
}

const QR_PREFIX = 'STP1';

function bytesToBase64Url(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const str = atob(b64 + pad);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as any).CompressionStream;
  if (!CS) return null;
  try {
    // Blob.stream() يتولى القراءة والكتابة معًا، ما يمنع التعليق عند الضغط.
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CS('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * يضغط حزمة JSON (deflate-raw) ويحوّلها إلى نص قصير يبدأ بـ STP1z.
 * إن لم يدعم المتصفح الضغط يُستخدم STP1r (Base64 خام) كبديل.
 */
export async function packSharePayload(json: string): Promise<{ text: string; compressed: boolean }> {
  const raw = new TextEncoder().encode(json);
  const packed = await deflate(raw);
  if (packed && packed.length < raw.length) {
    return { text: `${QR_PREFIX}z${bytesToBase64Url(packed)}`, compressed: true };
  }
  return { text: `${QR_PREFIX}r${bytesToBase64Url(raw)}`, compressed: false };
}

/** يقرأ نص مشاركة (مضغوطًا أو خامًا) ويعيد بياناته. */
export async function unpackSharePayload(text: string): Promise<SectionPayload> {
  const trimmed = text.trim();
  if (!trimmed.startsWith(QR_PREFIX)) return JSON.parse(trimmed);
  const mode = trimmed[QR_PREFIX.length];
  const body = trimmed.slice(QR_PREFIX.length + 1);
  const bytes = base64UrlToBytes(body);
  const raw = mode === 'z' ? await inflate(bytes) : bytes;
  if (!raw) throw new Error('تعذّر فك ضغط بيانات المشاركة.');
  return JSON.parse(new TextDecoder().decode(raw));
}

/**
 * حزمة مشاركة مضغوطة (مفاتيح قصيرة) لجدول شعبة واحدة،
 * تُقرأ بمسح رمز QR أو لصق النص — دون أي خادم.
 */
export async function buildSectionShare(db: DB, sectionId: number): Promise<SectionShare> {
  const sch = activeSchedule(db);
  const lessons = sch ? scheduleLessons(db, sch.id) : [];
  const section = db.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error('الشعبة غير موجودة.');
  const grade = db.grades.find((g) => g.id === section.grade_id);

  const days = db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx);
  const periods = db.periods.filter((p) => p.active !== 0 && p.kind !== 'break').sort((a, b) => a.idx - b.idx);
  const dayIndex = new Map(days.map((d, i) => [d.id, i]));
  const periodIndex = new Map(periods.map((p, i) => [p.id, i]));
  const mine = lessons.filter((l) => l.section_id === sectionId)
    .sort((a, b) => (dayIndex.get(a.day_id) || 0) - (dayIndex.get(b.day_id) || 0)
      || (periodIndex.get(a.period_id) || 0) - (periodIndex.get(b.period_id) || 0));

  const rows: Array<[number, number, string, string, string]> = mine.map((l) => [
    dayIndex.get(l.day_id) ?? 0,
    periodIndex.get(l.period_id) ?? 0,
    l.subject_name || '',
    l.teacher_name || '',
    l.room_name || '',
  ]);

  const payload: SectionPayload = {
    v: 1, a: 'stp',
    n: db.school.name,
    y: db.school.academic_year,
    t: db.school.term,
    g: grade?.name || '',
    s: section.name,
    d: days.map((d) => d.name),
    p: periods.map((p) => p.name),
    c: rows,
  };
  const json = JSON.stringify(payload);
  const packed = await packSharePayload(json);

  const lines: string[] = [
    `جدول ${grade?.name || ''} — شعبة ${section.name}`,
    `${db.school.name} · ${db.school.academic_year} · ${db.school.term}`,
    sch ? `${sch.name}${sch.status === 'published' ? ' (منشور)' : ' (مسودة)'}` : '',
    '',
  ].filter(Boolean);
  for (let di = 0; di < days.length; di++) {
    const dayRows = mine.filter((l) => dayIndex.get(l.day_id) === di);
    if (!dayRows.length) continue;
    lines.push(`■ ${days[di].name}`);
    for (const l of dayRows) {
      lines.push(`  ${l.period_name}: ${l.subject_name} — ${l.teacher_name || 'بلا معلم'}${l.room_name ? ` (${l.room_name})` : ''}`);
    }
  }
  lines.push('', `تم الإنشاء: ${fmtDate(new Date().toISOString().slice(0, 10))} · بيانات محلية دون خادم`);

  return {
    json,
    qr: packed.text,
    text: lines.join('\n'),
    title: `جدول ${grade?.name || ''} — شعبة ${section.name}`,
    fileName: `مشاركة-جدول-${grade?.name || 'صف'}-${section.name}`,
    size: new TextEncoder().encode(json).length,
    qrSize: new TextEncoder().encode(packed.text).length,
    compressed: packed.compressed,
    cells: rows.length,
  };
}

export async function qrDataUrl(text: string, width = 640): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: text.length > 1500 ? 'L' : 'M',
    margin: 1,
    width,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
