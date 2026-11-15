import type { DB, PermissionMatrix } from '../types';
import seedJson from '../data/seed.json';
import { DEMO_USERS } from './auth';
import { nowIso } from './model';

const KEY = 'stp-react-db-v1';

export function normalizeSeed(): DB {
  const raw: any = JSON.parse(JSON.stringify(seedJson));
  const settings: Record<string, string> = {};
  for (const row of raw.settings || []) settings[row.key] = String(row.value);
  let permissions: PermissionMatrix;
  try {
    permissions = JSON.parse(settings.permissions || '{}');
  } catch {
    permissions = {} as PermissionMatrix;
  }
  delete settings.permissions;
  const users = DEMO_USERS.map((u, i) => ({
    id: i + 1,
    name: u.name,
    username: u.username,
    role: u.role,
    teacher_id: u.teacher_id,
    active: 1,
    password_hash: '',
    created_at: nowIso(),
  }));
  return {
    school: raw.school[0],
    terms: raw.terms || [],
    days: raw.days || [],
    periods: raw.periods || [],
    rooms: raw.rooms || [],
    grades: raw.grades || [],
    sections: raw.sections || [],
    subjects: raw.subjects || [],
    teachers: raw.teachers || [],
    teacher_subjects: raw.teacher_subjects || [],
    teacher_unavailable: raw.teacher_unavailable || [],
    assignments: raw.assignments || [],
    schedules: raw.schedules || [],
    lessons: raw.lessons || [],
    absences: raw.absences || [],
    covers: raw.covers || [],
    supervision_areas: raw.supervision_areas || [],
    duties: raw.duties || [],
    calendar_events: raw.calendar_events || [],
    users,
    notifications: raw.notifications || [],
    audit_log: raw.audit_log || [],
    settings,
    permissions,
    version: 1,
  };
}

export function loadDB(): DB | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!parsed || !parsed.school || !Array.isArray(parsed.teachers)) return null;
    return parsed as DB;
  } catch {
    return null;
  }
}

export function saveDB(db: DB): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (err) {
    console.error('تعذّر حفظ البيانات محليًا', err);
  }
}

export function clearDB(): void {
  localStorage.removeItem(KEY);
}

export function exportDB(db: DB): string {
  return JSON.stringify({ app: 'school-timetable-pro', format: 1, exportedAt: nowIso(), data: db }, null, 2);
}

export function parseBackup(text: string): DB {
  const parsed = JSON.parse(text);
  const data = parsed?.data || parsed;
  if (!data || !data.school || !Array.isArray(data.teachers) || !Array.isArray(data.lessons)) {
    throw new Error('ملف النسخة الاحتياطية غير صالح أو لا ينتمي لهذا التطبيق.');
  }
  if (!data.permissions) data.permissions = {};
  if (Array.isArray(data.settings)) {
    const obj: Record<string, string> = {};
    for (const row of data.settings) obj[row.key] = String(row.value);
    data.settings = obj;
  }
  return data as DB;
}
