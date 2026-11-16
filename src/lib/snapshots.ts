import type { DB } from '../types';

const KEY = 'stp-snapshots-v1';
const MAX_ITEMS = 8;
const MAX_TOTAL = 3_000_000;

export interface Snapshot {
  id: string;
  label: string;
  at: string;
  scheduleId: number | null;
  scheduleName: string;
  lessons: number;
  size: number;
  data: DB;
}

function readRaw(): Snapshot[] {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: Snapshot[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (err) {
    throw new Error('مساحة المتصفح ممتلئة: احذف لقطات قديمة ثم أعد المحاولة.');
  }
}

export function listSnapshots(): Snapshot[] {
  return readRaw().sort((a, b) => b.at.localeCompare(a.at));
}

export function getSnapshot(id: string): Snapshot | undefined {
  return readRaw().find((s) => s.id === id);
}

export function createSnapshot(db: DB, label?: string): Snapshot {
  const data: DB = JSON.parse(JSON.stringify(db));
  const size = JSON.stringify(data).length;
  const activeId = Number(db.settings?.active_schedule || 0);
  const sch = db.schedules.find((s) => s.id === activeId) || db.schedules[0];
  const snap: Snapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: label || `لقطة ${new Date().toLocaleString('ar-SA')}`,
    at: new Date().toISOString(),
    scheduleId: sch?.id ?? null,
    scheduleName: sch?.name || '—',
    lessons: sch ? db.lessons.filter((l) => l.schedule_id === sch.id).length : 0,
    size,
    data,
  };
  let items = readRaw();
  items.unshift(snap);
  // تقليم: العدد ثم الحجم الكلي.
  items = items.slice(0, MAX_ITEMS);
  let total = items.reduce((s, x) => s + (x.size || 0), 0);
  while (items.length > 1 && total > MAX_TOTAL) {
    const removed = items.pop();
    total -= removed?.size || 0;
  }
  writeRaw(items);
  return snap;
}

export function deleteSnapshot(id: string): void {
  writeRaw(readRaw().filter((s) => s.id !== id));
}

export function clearSnapshots(): void {
  localStorage.removeItem(KEY);
}

/** يعيد نفس البيانات بنص يفهمه store.restore. */
export function snapshotToBackup(snap: Snapshot): string {
  return JSON.stringify({ app: 'school-timetable-pro', format: 1, exportedAt: snap.at, snapshot: snap.label, data: snap.data });
}

export interface DiffRow {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
}

const COUNT_LABELS: Array<[keyof DB, string]> = [
  ['teachers', 'المعلمون'],
  ['sections', 'الشعب'],
  ['subjects', 'المواد'],
  ['assignments', 'الإسنادات'],
  ['lessons', 'الحصص'],
  ['duties', 'المناوبات'],
  ['covers', 'حصص الانتظار'],
  ['absences', 'سجلات الغياب'],
  ['calendar_events', 'أحداث التقويم'],
  ['users', 'المستخدمون'],
  ['rooms', 'القاعات'],
];

export interface SnapshotDiff {
  counts: DiffRow[];
  schoolsDiffer: boolean;
  changedLessons: number;
  addedLessons: number;
  removedLessons: number;
  sameSchedule: boolean;
}

/** مقارنة إحصائية بين لقطتين: أعداد الكيانات وفروق الحصص الفعلية. */
export function diffSnapshots(a: Snapshot, b: Snapshot): SnapshotDiff {
  const counts: DiffRow[] = COUNT_LABELS.map(([key, label]) => {
    const before = Array.isArray((a.data as any)[key]) ? (a.data as any)[key].length : 0;
    const after = Array.isArray((b.data as any)[key]) ? (b.data as any)[key].length : 0;
    return { key: String(key), label, before, after, delta: after - before };
  });
  const schoolA = JSON.stringify(a.data.school || {});
  const schoolB = JSON.stringify(b.data.school || {});
  const lessonsA = new Map(a.data.lessons.map((l) => [l.id, l]));
  const lessonsB = new Map(b.data.lessons.map((l) => [l.id, l]));
  let changed = 0;
  let added = 0;
  let removed = 0;
  for (const [id, l] of lessonsB) {
    const old = lessonsA.get(id);
    if (!old) { added++; continue; }
    if (old.day_id !== l.day_id || old.period_id !== l.period_id || old.teacher_id !== l.teacher_id
      || old.room_id !== l.room_id || old.subject_id !== l.subject_id || old.locked !== l.locked) changed++;
  }
  for (const id of lessonsA.keys()) if (!lessonsB.has(id)) removed++;
  return {
    counts,
    schoolsDiffer: schoolA !== schoolB,
    changedLessons: changed,
    addedLessons: added,
    removedLessons: removed,
    sameSchedule: a.scheduleId === b.scheduleId,
  };
}
