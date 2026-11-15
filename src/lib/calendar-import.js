'use strict';
/**
 * استيراد أحداث التقويم من ملف CSV.
 * لا يعتمد على أي مكتبة خارجية، ويعمل مع رؤوس عربية أو إنجليزية،
 * ويتعامل مع BOM، والفواصل (فاصلة/فاصلة منقوطة/تاب)، والاقتباسات.
 */

const HEADER_ALIASES = {
  title: ['title', 'event', 'name', 'العنوان', 'الحدث', 'اسم الحدث', 'المناسبة'],
  type: ['type', 'kind', 'النوع', 'نوع الحدث', 'التصنيف'],
  start: ['start_date', 'start', 'from', 'date', 'من تاريخ', 'البداية', 'تاريخ البداية', 'من', 'تاريخ'],
  end: ['end_date', 'end', 'to', 'إلى تاريخ', 'النهاية', 'تاريخ النهاية', 'إلى', 'حتى'],
  note: ['note', 'notes', 'description', 'ملاحظات', 'ملاحظة', 'الوصف', 'تفاصيل'],
};

const TYPE_ALIASES = {
  holiday: 'holiday', 'إجازة': 'holiday', 'إجازة رسمية': 'holiday', 'عطلة': 'holiday',
  school_holiday: 'school_holiday', 'إجازة مدرسية': 'school_holiday', 'إجازة بين الفصلين': 'school_holiday',
  exam: 'exam', 'اختبار': 'exam', 'اختبارات': 'exam', 'امتحان': 'exam',
  event: 'event', 'فعالية': 'event', 'حدث': 'event', 'مناسبة': 'event', 'نشاط': 'event',
  other: 'other', 'أخرى': 'other', 'متنوع': 'other',
};

function normalizeArabic(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\u0640/g, '');
}

function normalizeHeader(value) {
  return normalizeArabic(value).replace(/[\s_\-]+/g, '');
}

const TYPE_MAP = new Map(Object.entries(TYPE_ALIASES).map(([key, val]) => [normalizeArabic(key), val]));

function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  if (!src.trim()) return [];
  const firstLine = src.split(/\r?\n/)[0] || '';
  const counts = [
    [',', (firstLine.match(/,/g) || []).length],
    [';', (firstLine.match(/;/g) || []).length],
    ['\t', (firstLine.match(/\t/g) || []).length],
  ].sort((a, b) => b[1] - a[1]);
  const delimiter = counts[0][1] > 0 ? counts[0][0] : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (ch === '\r') continue;
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function normalizeDate(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  let y, m, d;
  let match = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (match) { y = Number(match[1]); m = Number(match[2]); d = Number(match[3]); }
  else {
    match = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!match) return '';
    d = Number(match[1]); m = Number(match[2]); y = Number(match[3]);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizeType(raw) {
  const key = normalizeArabic(raw).replace(/\s+/g, ' ');
  if (!key) return 'event';
  return TYPE_MAP.get(key) || 'event';
}

function resolveHeaderMap(cells) {
  const map = {};
  cells.forEach((cell, index) => {
    const h = normalizeHeader(cell);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[key] !== undefined) continue;
      if (aliases.some(a => normalizeHeader(a) === h)) { map[key] = index; break; }
    }
  });
  return map;
}

/**
 * يحوّل نص CSV إلى أحداث جاهزة للإدخال.
 * يعيد { events, errors, hasHeader }.
 */
function parseCalendarCsv(text) {
  const rows = parseCsv(text);
  const events = [];
  const errors = [];
  if (!rows.length) return { events, errors: ['الملف فارغ'], hasHeader: false };

  const headerMap = resolveHeaderMap(rows[0]);
  const hasHeader = headerMap.title !== undefined;
  const map = hasHeader ? headerMap : { title: 0, type: 1, start: 2, end: 3, note: 4 };
  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < rows.length; i++) {
    const cells = rows[i];
    const get = (key) => (map[key] === undefined ? '' : String(cells[map[key]] || '').trim());
    const title = get('title');
    const start = normalizeDate(get('start'));
    const endRaw = normalizeDate(get('end'));
    const line = i + 1;
    if (!title) { errors.push(`السطر ${line}: العنوان مطلوب`); continue; }
    if (!start) { errors.push(`السطر ${line}: تاريخ البداية غير صالح (${get('start') || 'فارغ'})`); continue; }
    const end = endRaw || start;
    if (end < start) { errors.push(`السطر ${line}: تاريخ النهاية قبل البداية`); continue; }
    events.push({
      title: title.slice(0, 200),
      type: normalizeType(get('type')),
      start_date: start,
      end_date: end,
      note: get('note').slice(0, 500),
    });
  }
  return { events, errors, hasHeader };
}

export { parseCsv, parseCalendarCsv, normalizeDate, normalizeType };
