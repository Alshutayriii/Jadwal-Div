import type { DB } from '../types';
import { uid } from './model';

export type DataKind = 'teachers' | 'subjects' | 'sections' | 'assignments';

export interface ImportResult {
  db: DB;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const KIND_LABEL: Record<DataKind, string> = {
  teachers: 'المعلمون', subjects: 'المواد', sections: 'الشعب', assignments: 'الإسنادات',
};

export const KIND_HEADERS: Record<DataKind, string[]> = {
  teachers: ['الاسم', 'الرقم الوظيفي', 'التخصص', 'النصاب الأسبوعي', 'الحد اليومي', 'الجوال', 'البريد'],
  subjects: ['الاسم', 'المرحلة', 'الحصص الأسبوعية', 'الحد اليومي', 'اللون', 'يحتاج معمل'],
  sections: ['الصف', 'الشعبة', 'القاعة', 'عدد الطلاب'],
  assignments: ['الصف', 'الشعبة', 'المادة', 'المعلم', 'الحصص الأسبوعية', 'القاعة'],
};

export const KIND_SAMPLE: Record<DataKind, string[]> = {
  teachers: ['أحمد محمد', '1001', 'الرياضيات', '20', '6', '0500000000', ''],
  subjects: ['مادة جديدة', 'متوسط', '2', '1', '#4338ca', 'لا'],
  sections: ['الصف الأول المتوسط', 'أ', 'فصل 1/1', '30'],
  assignments: ['الصف الأول المتوسط', 'أ', 'الرياضيات', 'أحمد محمد', '5', ''],
};

const ALIASES: Record<string, string> = {
  'الاسم': 'name', 'اسم المعلم': 'name', 'المعلم': 'teacher', 'name': 'name', 'teacher': 'teacher',
  'الرقم الوظيفي': 'employee_no', 'رقم الموظف': 'employee_no', 'employee_no': 'employee_no',
  'التخصص': 'specialty', 'specialty': 'specialty',
  'النصاب': 'weekly_load', 'النصاب الأسبوعي': 'weekly_load', 'weekly_load': 'weekly_load',
  'الحد اليومي': 'max_daily', 'max_daily': 'max_daily',
  'المادة': 'subject', 'subject': 'subject',
  'الجوال': 'phone', 'phone': 'phone', 'البريد': 'email', 'email': 'email',
  'المرحلة': 'stage', 'stage': 'stage',
  'الحصص الأسبوعية': 'weekly_periods', 'عدد الحصص': 'weekly_periods', 'الحصص': 'weekly_periods',
  'weekly_periods': 'weekly_periods', 'حصص أسبوعية': 'weekly_periods',
  'max_per_day': 'max_per_day', 'اللون': 'color', 'color': 'color',
  'يحتاج معمل': 'needs_lab', 'needs_lab': 'needs_lab',
  'الصف': 'grade', 'grade': 'grade',
  'الشعبة': 'section', 'section': 'section',
  'القاعة': 'room', 'room': 'room',
  'عدد الطلاب': 'students', 'students': 'students',
};

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function truthy(value: any): boolean {
  const s = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'نعم', 'yes', 'y', 'يحتاج', 'معمل'].includes(s);
}

export function parseCsv(text: string): string[][] {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* ignore */ }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** يحوّل مصفوفة صفوف (أولها العناوين) إلى كائنات بمفاتيح موحّدة. */
export function matrixToRows(matrix: string[][]): Record<string, string>[] {
  if (!matrix.length) return [];
  const headers = matrix[0].map((h) => ALIASES[String(h || '').trim()] || String(h || '').trim());
  return matrix.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) obj[h] = String(r[i] ?? '').trim(); });
    return obj;
  });
}

export function normalizeNumbers(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));
}

export function tableRows(db: DB, kind: DataKind): Record<string, any>[] {
  if (kind === 'teachers') {
    return db.teachers.map((t) => ({
      'الاسم': t.name, 'الرقم الوظيفي': t.employee_no, 'التخصص': t.specialty,
      'النصاب الأسبوعي': t.weekly_load, 'الحد اليومي': t.max_daily, 'الجوال': t.phone || '', 'البريد': t.email || '',
    }));
  }
  if (kind === 'subjects') {
    return db.subjects.map((s) => ({
      'الاسم': s.name, 'المرحلة': s.stage, 'الحصص الأسبوعية': s.weekly_periods,
      'الحد اليومي': s.max_per_day, 'اللون': s.color, 'يحتاج معمل': s.needs_lab ? 'نعم' : 'لا',
    }));
  }
  if (kind === 'sections') {
    const grades = new Map(db.grades.map((g) => [g.id, g.name]));
    const rooms = new Map(db.rooms.map((r) => [r.id, r.name]));
    return db.sections.map((s) => ({
      'الصف': grades.get(s.grade_id) || '', 'الشعبة': s.name,
      'القاعة': rooms.get(Number(s.room_id)) || '', 'عدد الطلاب': s.students || 0,
    }));
  }
  const grades = new Map(db.grades.map((g) => [g.id, g.name]));
  const sections = new Map(db.sections.map((s) => [s.id, s]));
  const subjects = new Map(db.subjects.map((s) => [s.id, s.name]));
  const teachers = new Map(db.teachers.map((t) => [t.id, t.name]));
  const rooms = new Map(db.rooms.map((r) => [r.id, r.name]));
  return db.assignments.map((a) => {
    const sec = sections.get(a.section_id);
    return {
      'الصف': grades.get(Number(sec?.grade_id)) || '', 'الشعبة': sec?.name || '',
      'المادة': subjects.get(a.subject_id) || '', 'المعلم': teachers.get(Number(a.teacher_id)) || '',
      'الحصص الأسبوعية': a.weekly_periods, 'القاعة': rooms.get(Number(a.room_id)) || '',
    };
  });
}

export function csvFromRows(rows: Record<string, any>[], headers: string[]): string {
  const esc = (v: any) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  return `\uFEFF${[headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\r\n')}`;
}

export function templateCsv(kind: DataKind): string {
  return csvFromRows([{ ...Object.fromEntries(KIND_HEADERS[kind].map((h, i) => [h, KIND_SAMPLE[kind][i]])) }], KIND_HEADERS[kind]);
}

/**
 * يستورد صفوفًا إلى قاعدة البيانات مع تحديث السجلات المطابقة بدل تكرارها.
 * تُرجع نسخة جديدة من قاعدة البيانات، ولا تحفظها بنفسها.
 */
export function importTable(db: DB, kind: DataKind, rows: Record<string, string>[]): ImportResult {
  const next: DB = JSON.parse(JSON.stringify(db));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const cleanRows = normalizeNumbers(rows);

  if (kind === 'teachers') {
    for (const row of cleanRows) {
      const name = String(row.name || '').trim();
      if (!name) { skipped += 1; continue; }
      const employeeNo = String(row.employee_no || '').trim();
      const existing = next.teachers.find((t) => (employeeNo && String(t.employee_no) === employeeNo)
        || (!employeeNo && t.name === name));
      if (existing) {
        existing.name = name;
        if (employeeNo) existing.employee_no = employeeNo;
        if (row.specialty !== undefined) existing.specialty = row.specialty;
        if (row.weekly_load !== undefined) existing.weekly_load = toNumber(row.weekly_load, existing.weekly_load);
        if (row.max_daily !== undefined) existing.max_daily = toNumber(row.max_daily, existing.max_daily);
        if (row.phone !== undefined) existing.phone = row.phone;
        if (row.email !== undefined) existing.email = row.email;
        updated += 1;
      } else {
        next.teachers.push({
          id: uid(next.teachers), name, employee_no: employeeNo, specialty: row.specialty || '',
          weekly_load: toNumber(row.weekly_load, 20), max_daily: toNumber(row.max_daily, 6),
          phone: row.phone || '', email: row.email || '', notes: '', active: 1,
        });
        added += 1;
      }
    }
  } else if (kind === 'subjects') {
    for (const row of cleanRows) {
      const name = String(row.name || '').trim();
      if (!name) { skipped += 1; continue; }
      const existing = next.subjects.find((s) => s.name === name);
      if (existing) {
        if (row.stage) existing.stage = row.stage;
        if (row.weekly_periods !== undefined) existing.weekly_periods = toNumber(row.weekly_periods, existing.weekly_periods);
        if (row.max_per_day !== undefined) existing.max_per_day = toNumber(row.max_per_day, existing.max_per_day);
        if (row.color) existing.color = row.color;
        if (row.needs_lab !== undefined) existing.needs_lab = truthy(row.needs_lab) ? 1 : 0;
        updated += 1;
      } else {
        next.subjects.push({
          id: uid(next.subjects), name, stage: row.stage || next.school.stage || 'متوسط',
          weekly_periods: toNumber(row.weekly_periods, 1), max_per_day: toNumber(row.max_per_day, 1),
          color: row.color || '#4338ca', needs_lab: truthy(row.needs_lab) ? 1 : 0, active: 1,
        });
        added += 1;
      }
    }
  } else if (kind === 'sections') {
    for (const row of cleanRows) {
      const sectionName = String(row.section || row.name || '').trim();
      const gradeName = String(row.grade || '').trim();
      if (!sectionName || !gradeName) { skipped += 1; continue; }
      const grade = next.grades.find((g) => g.name === gradeName);
      if (!grade) { errors.push(`الصف «${gradeName}» غير موجود. أضفه أولًا.`); continue; }
      const room = String(row.room || '').trim()
        ? next.rooms.find((r) => r.name === row.room)
        : null;
      const existing = next.sections.find((s) => s.grade_id === grade.id && s.name === sectionName);
      if (existing) {
        if (row.room !== undefined) existing.room_id = room?.id ?? null;
        if (row.students !== undefined) existing.students = toNumber(row.students, existing.students || 0);
        updated += 1;
      } else {
        next.sections.push({
          id: uid(next.sections), grade_id: grade.id, name: sectionName,
          room_id: room?.id ?? null, students: toNumber(row.students, 30), active: 1,
        });
        added += 1;
      }
    }
  } else {
    for (const row of cleanRows) {
      const sectionName = String(row.section || '').trim();
      const subjectName = String(row.name || row.subject || '').trim();
      const teacherName = String(row.teacher || '').trim();
      if (!sectionName || !subjectName) { skipped += 1; continue; }
      const gradeName = String(row.grade || '').trim();
      const grade = gradeName ? next.grades.find((g) => g.name === gradeName) : null;
      const section = next.sections.find((s) => s.name === sectionName && (!grade || s.grade_id === grade.id));
      if (!section) { errors.push(`الشعبة «${sectionName}» غير موجودة${gradeName ? ` في الصف «${gradeName}»` : ''}.`); continue; }
      const subject = next.subjects.find((s) => s.name === subjectName);
      if (!subject) { errors.push(`المادة «${subjectName}» غير موجودة.`); continue; }
      const teacher = teacherName ? next.teachers.find((t) => t.name === teacherName) : null;
      if (teacherName && !teacher) { errors.push(`المعلم «${teacherName}» غير موجود.`); continue; }
      const room = String(row.room || '').trim() ? next.rooms.find((r) => r.name === row.room) : null;
      const existing = next.assignments.find((a) => a.section_id === section.id && a.subject_id === subject.id);
      if (existing) {
        existing.teacher_id = teacher?.id ?? existing.teacher_id ?? null;
        if (row.weekly_periods !== undefined) existing.weekly_periods = toNumber(row.weekly_periods, existing.weekly_periods);
        if (row.room !== undefined) existing.room_id = room?.id ?? null;
        updated += 1;
      } else {
        next.assignments.push({
          id: uid(next.assignments), section_id: section.id, subject_id: subject.id,
          teacher_id: teacher?.id ?? null, weekly_periods: toNumber(row.weekly_periods, subject.weekly_periods || 1),
          room_id: room?.id ?? null, note: '',
        });
        added += 1;
      }
    }
  }

  if (added || updated) {
    next.audit_log.unshift({
      id: uid(next.audit_log), username: 'system', action: 'استيراد بيانات',
      entity: kind, details: `${KIND_LABEL[kind]}: +${added} / ~${updated}`, created_at: new Date().toISOString(),
    });
  }
  return { db: next, added, updated, skipped, errors };
}
