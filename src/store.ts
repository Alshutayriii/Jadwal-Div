import { create } from 'zustand';
import type { DB, Lesson, Session, Toast } from './types';
import {
  clearDB, clearSession, exportDB, loadDB, loadSession, normalizeSeed, parseBackup, saveDB, saveSession,
} from './lib/storage';
import { DEMO_USERS, hashPassword, verifyPassword } from './lib/auth';
import {
  activeCtx, activeSchedule, buildSchedulerInput, enrich, nowIso, scheduleLessons, uid,
} from './lib/model';
import { generate } from './lib/scheduler';
import { detect, validatePlacement } from './lib/conflicts';
import { allocateCovers } from './lib/covers';
import { generateDuties } from './lib/duties';

const GUARDS: Record<string, [string, string, string][]> = {
  teachers: [
    ['assignments', 'teacher_id', 'إسنادات المواد'],
    ['lessons', 'teacher_id', 'حصص الجدول'],
    ['duties', 'teacher_id', 'المناوبات'],
    ['covers', 'substitute_id', 'حصص الانتظار'],
  ],
  subjects: [['assignments', 'subject_id', 'إسنادات المواد'], ['lessons', 'subject_id', 'حصص الجدول']],
  sections: [['assignments', 'section_id', 'إسنادات المواد'], ['lessons', 'section_id', 'حصص الجدول']],
  rooms: [['lessons', 'room_id', 'حصص الجدول'], ['sections', 'room_id', 'الشعب']],
  grades: [['sections', 'grade_id', 'الشعب']],
  supervision_areas: [['duties', 'area_id', 'المناوبات']],
};

const TABLES: Record<string, keyof DB> = {
  teachers: 'teachers', subjects: 'subjects', sections: 'sections', rooms: 'rooms', grades: 'grades',
  supervision_areas: 'supervision_areas', calendar_events: 'calendar_events', users: 'users',
  assignments: 'assignments', absences: 'absences', covers: 'covers', duties: 'duties',
};

/** لقطة من حصص جدول واحد، لأجل التراجع/الإعادة. */
export interface LessonSnapshot {
  scheduleId: number;
  lessons: Lesson[];
  label: string;
  at: string;
}

const HARD_TYPES = [
  'teacher_clash', 'section_clash', 'room_clash',
  'teacher_daily', 'section_daily', 'teacher_overload',
];

const HARD_LABEL: Record<string, string> = {
  teacher_clash: 'تعارض معلم', section_clash: 'تعارض شعبة', room_clash: 'تعارض قاعة',
  teacher_daily: 'تجاوز الحد اليومي للمعلم', section_daily: 'سقف يوم الشعبة',
  teacher_overload: 'تجاوز النصاب الأسبوعي',
};

function lessonSnapshot(db: DB, scheduleId: number): Lesson[] {
  return db.lessons.filter((l) => l.schedule_id === scheduleId).map((l) => ({ ...l }));
}

function hardCounts(db: DB, scheduleId: number): Record<string, number> {
  const res = detect({ ...enrich(db), lessons: scheduleLessons(db, scheduleId), school: db.school });
  const out: Record<string, number> = {};
  for (const t of HARD_TYPES) out[t] = res.byType?.[t] || 0;
  return out;
}

/** يصف التعارضات الحقيقية لحصة بعد وضعها في مكانها على نسخة معدّلة. */
function clashProblems(db: DB, lesson: Lesson): string[] {
  const problems: string[] = [];
  const tName = db.teachers.find((t) => t.id === lesson.teacher_id)?.name || '';
  const rName = db.rooms.find((r) => r.id === lesson.room_id)?.name || '';
  const others = db.lessons.filter((o) => o.id !== lesson.id && o.schedule_id === lesson.schedule_id
    && o.day_id === lesson.day_id && o.period_id === lesson.period_id);
  for (const o of others) {
    const sec = db.sections.find((s) => s.id === o.section_id)?.name || '';
    const grade = db.grades.find((g) => g.id === db.sections.find((s) => s.id === o.section_id)?.grade_id)?.name || '';
    if (lesson.teacher_id && o.teacher_id === lesson.teacher_id) {
      problems.push(`المعلم ${tName} لديه حصة أخرى مع ${grade} شعبة ${sec} في هذا الوقت.`);
    }
    if (o.section_id === lesson.section_id) {
      problems.push('الشعبة لديها حصة أخرى في هذا الوقت.');
    }
    if (lesson.room_id && o.room_id === lesson.room_id) {
      problems.push(`القاعة ${rName} مستخدمة في هذا الوقت.`);
    }
  }
  return [...new Set(problems)];
}


interface AppState {
  db: DB;
  session: Session | null;
  ready: boolean;
  toasts: Toast[];
  lastCovers: any | null;
  history: LessonSnapshot[];
  future: LessonSnapshot[];
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
  perm: (module: string, need?: 'none' | 'view' | 'edit') => boolean;
  saveEntity: (key: string, values: any, id?: number | null) => any;
  deleteEntity: (key: string, id: number) => void;
  saveSchool: (patch: any) => void;
  saveAssignment: (values: any, id?: number | null) => void;
  deleteAssignment: (id: number) => void;
  generateSchedule: (options?: any) => any;
  publishSchedule: (id: number) => void;
  validateLesson: (candidate: any, ignoreId?: number | number[] | null) => { ok: boolean; problems: string[] };
  addLesson: (candidate: any) => { ok: boolean; problems: string[] };
  updateLesson: (id: number, patch: any) => { ok: boolean; problems: string[] };
  deleteLesson: (id: number) => void;
  toggleLock: (id: number) => void;
  pushHistory: (label: string) => void;
  undo: () => string | null;
  redo: () => string | null;
  moveLesson: (id: number, dayId: number, periodId: number) => { ok: boolean; problems: string[]; swap?: boolean };
  allocateAbsences: (date: string, teacherIds: number[], reason?: string, options?: any) => any;
  setCoverSubstitute: (coverId: number, teacherId: number) => void;
  clearCovers: (date: string) => void;
  generateDutiesAll: (options?: any) => any;
  updateDuty: (id: number, patch: any) => void;
  importCalendar: (events: any[]) => { added: number; skipped: number };
  setPermission: (role: string, module: string, level: string) => void;
  setSetting: (key: string, value: string) => void;
  setDayActive: (id: number, active: boolean) => void;
  setPeriodActive: (id: number, active: boolean) => void;
  backup: () => string;
  restore: (text: string) => void;
  resetDemo: () => Promise<void>;
  setPassword: (userId: number, password: string) => Promise<void>;
  log: (action: string, entity?: string, details?: string) => void;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

let toastSeq = 1;

export const useApp = create<AppState>((set, get) => ({
  db: normalizeSeed(),
  session: null,
  ready: false,
  toasts: [],
  lastCovers: null,
  history: [],
  future: [],

  async init() {
    let db = loadDB();
    if (!db) db = normalizeSeed();
    // إنشاء تجزئات للحسابات التجريبية عند أول تشغيل فقط.
    let changed = false;
    for (const user of db.users) {
      if (!user.password_hash) {
        const demo = DEMO_USERS.find((d) => d.username === user.username);
        if (demo) {
          user.password_hash = await hashPassword(demo.password);
          changed = true;
        }
      }
    }
    if (!db.settings.theme) db.settings.theme = 'light';
    if (db.settings.theme === 'dark') document.documentElement.classList.add('dark');
    saveDB(db);
    // استعادة الجلسة بعد إعادة تحميل الصفحة (محليًا فقط).
    const cached = loadSession<Session>();
    const user = cached?.user ? db.users.find((u) => u.id === cached.user.id) : null;
    const session: Session | null = user
      ? { user, role: user.role, teacherId: user.teacher_id ?? null, at: nowIso() }
      : null;
    if (!session) clearSession();
    set({ db, ready: true, session, ...(changed ? {} : {}) });
  },

  async login(username, password) {
    const db = get().db;
    const user = db.users.find((u) => u.username === String(username || '').trim() && u.active !== 0);
    if (!user) return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
    let ok = false;
    try {
      ok = await verifyPassword(password, user.password_hash);
    } catch (err: any) {
      return { ok: false, error: err.message || 'تعذّر التحقق من كلمة المرور.' };
    }
    if (!ok) return { ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
    const session: Session = { user, role: user.role, teacherId: user.teacher_id ?? null, at: nowIso() };
    set({ session });
    saveSession(session);
    get().log('تسجيل دخول', 'users', user.username);
    return { ok: true };
  },

  logout() {
    const name = get().session?.user?.username;
    if (name) get().log('تسجيل خروج', 'users', name);
    clearSession();
    set({ session: null, lastCovers: null });
  },

  toast(kind, text) {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  perm(module, need = 'view') {
    const { db, session } = get();
    if (!session) return false;
    const order: Record<string, number> = { none: 0, view: 1, edit: 2 };
    const level = db.permissions?.[session.role]?.[module] || 'none';
    return (order[level] || 0) >= (order[need] || 0);
  },

  saveEntity(key, values, id = null) {
    const table = TABLES[key];
    if (!table) throw new Error('كيان غير معروف');
    const db = clone(get().db);
    const rows: any[] = db[table] as any[];
    if (values.username) {
      const dup = db.users.find((u) => u.username === values.username && u.id !== id);
      if (dup) throw new Error('اسم المستخدم مستخدم مسبقًا');
    }
    if (key === 'teachers' && values.employee_no) {
      const dup = db.teachers.find((t) => String(t.employee_no) === String(values.employee_no) && t.id !== id);
      if (dup) throw new Error('الرقم الوظيفي مستخدم مسبقًا');
    }
    if (key === 'teachers' && !String(values.name || '').trim()) throw new Error('اسم المعلم مطلوب');
    if (key === 'subjects' && !String(values.name || '').trim()) throw new Error('اسم المادة مطلوب');
    if (key === 'sections' && (!String(values.name || '').trim() || !values.grade_id)) throw new Error('اسم الشعبة والصف مطلوبان');
    if (key === 'rooms' && !String(values.name || '').trim()) throw new Error('اسم القاعة مطلوب');
    if (key === 'grades' && !String(values.name || '').trim()) throw new Error('اسم الصف مطلوب');
    if (key === 'calendar_events' && (!values.title || !values.start_date)) throw new Error('عنوان الحدث وتاريخه مطلوبان');
    let saved: any;
    if (id) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error('السجل غير موجود');
      rows[idx] = { ...rows[idx], ...values, id };
      saved = rows[idx];
    } else {
      saved = { ...values, id: uid(rows) };
      rows.push(saved);
    }
    db.audit_log.unshift({ id: uid(db.audit_log), username: get().session?.user?.username || 'system', action: id ? 'تعديل' : 'إضافة', entity: key, details: saved.name || saved.title || String(saved.id), created_at: nowIso() });
    saveDB(db);
    set({ db });
    return saved;
  },

  deleteEntity(key, id) {
    const table = TABLES[key];
    const db = clone(get().db);
    if (key === 'users' && get().session?.user?.id === id) throw new Error('لا يمكن حذف الحساب الحالي.');
    if (key === 'users' && db.users.filter((u) => u.active !== 0).length <= 1) throw new Error('يجب بقاء مستخدم نشط واحد على الأقل.');
    for (const [t, col, label] of GUARDS[key] || []) {
      const n = (db as any)[t].filter((r: any) => Number(r[col]) === Number(id)).length;
      if (n > 0) throw new Error(`لا يمكن الحذف: يوجد ${n} سجل مرتبط في ${label}. احذفها أو عدّلها أولًا.`);
    }
    const rows: any[] = db[table] as any[];
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('السجل غير موجود');
    const removed = rows.splice(idx, 1)[0];
    db.audit_log.unshift({ id: uid(db.audit_log), username: get().session?.user?.username || 'system', action: 'حذف', entity: key, details: removed.name || removed.title || String(id), created_at: nowIso() });
    saveDB(db);
    set({ db });
  },

  saveSchool(patch) {
    const db = clone(get().db);
    db.school = { ...db.school, ...patch };
    db.audit_log.unshift({ id: uid(db.audit_log), username: get().session?.user?.username || 'system', action: 'تعديل بيانات المدرسة', entity: 'school', details: db.school.name, created_at: nowIso() });
    saveDB(db);
    set({ db });
  },

  saveAssignment(values, id = null) {
    const db = clone(get().db);
    const rows = db.assignments;
    if (id) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error('الإسناد غير موجود');
      rows[idx] = { ...rows[idx], ...values, id };
    } else {
      rows.push({ ...values, id: uid(rows) });
    }
    saveDB(db);
    set({ db });
  },

  deleteAssignment(id) {
    const db = clone(get().db);
    const dbLessons = db.lessons.filter((l) => l.assignment_id === id).length;
    if (dbLessons) throw new Error(`لا يمكن حذف الإسناد: توجد ${dbLessons} حصة مرتبطة به في الجدول.`);
    db.assignments = db.assignments.filter((a) => a.id !== id);
    saveDB(db);
    set({ db });
  },

  generateSchedule(options = {}) {
    const db = clone(get().db);
    const ctx = enrich(db);
    const current = activeSchedule(db);
    const locked = current
      ? db.lessons.filter((l) => l.schedule_id === current.id && l.locked).map((l) => ({ ...l }))
      : [];
    const input = buildSchedulerInput(ctx, options, locked, db.school.max_daily_section);
    const result = generate(input);
    const id = uid(db.schedules);
    const name = `الجدول ${db.schedules.length + 1}`;
    db.schedules.push({ id, name, status: 'draft', created_at: nowIso() });
    let lessonId = uid(db.lessons);
    for (const l of result.lessons) {
      db.lessons.push({ ...l, id: lessonId++, schedule_id: id, locked: l.locked || 0 });
    }
    db.settings.active_schedule = String(id);
    db.audit_log.unshift({ id: uid(db.audit_log), username: get().session?.user?.username || 'system', action: 'توليد جدول', entity: 'timetable', details: `${result.lessons.length}/${result.stats?.required ?? '?'}`, created_at: nowIso() });
    saveDB(db);
    set({ db });
    return { ...result, scheduleId: id };
  },

  publishSchedule(id) {
    const db = clone(get().db);
    const sch = db.schedules.find((s) => s.id === id);
    if (!sch) throw new Error('الجدول غير موجود');
    const conflicts = detect({ ...enrich(db), lessons: scheduleLessons(db, id), school: db.school });
    if (conflicts.errors > 0) throw new Error(`لا يمكن النشر: يوجد ${conflicts.errors} تعارضًا. عالجها أولًا.`);
    db.schedules = db.schedules.map((s) => ({ ...s, status: s.id === id ? 'published' : 'draft' })) as any;
    db.settings.active_schedule = String(id);
    db.audit_log.unshift({ id: uid(db.audit_log), username: get().session?.user?.username || 'system', action: 'نشر جدول', entity: 'timetable', details: sch.name, created_at: nowIso() });
    saveDB(db);
    set({ db });
  },

  validateLesson(candidate, ignoreId = null) {
    const ctx = activeCtx(get().db);
    return validatePlacement(candidate, ctx, ignoreId);
  },

  addLesson(candidate) {
    const check = get().validateLesson(candidate);
    if (!check.ok) return check;
    const db = clone(get().db);
    const sch = activeSchedule(db);
    if (!sch) throw new Error('لا يوجد جدول. ولّد جدولًا أولًا.');
    db.lessons.push({ ...candidate, id: uid(db.lessons), schedule_id: sch.id, locked: candidate.locked || 0 });
    get().pushHistory('إضافة حصة');
    saveDB(db);
    set({ db });
    return check;
  },

  updateLesson(id, patch) {
    const db = clone(get().db);
    const current = db.lessons.find((l) => l.id === id);
    if (!current) throw new Error('الحصة غير موجودة');
    const candidate = { ...current, ...patch };
    const check = get().validateLesson(candidate, id);
    if (!check.ok) return check;
    Object.assign(current, patch);
    get().pushHistory('تعديل حصة');
    saveDB(db);
    set({ db });
    return check;
  },

  deleteLesson(id) {
    const db = clone(get().db);
    db.lessons = db.lessons.filter((l) => l.id !== id);
    get().pushHistory('حذف حصة');
    saveDB(db);
    set({ db });
  },

  toggleLock(id) {
    const db = clone(get().db);
    const l = db.lessons.find((x) => x.id === id);
    if (l) l.locked = l.locked ? 0 : 1;
    get().pushHistory('تغيير التثبيت');
    saveDB(db);
    set({ db });
  },

  pushHistory(label) {
    const db = get().db;
    const sch = activeSchedule(db);
    if (!sch) return;
    const entry: LessonSnapshot = {
      scheduleId: sch.id, lessons: lessonSnapshot(db, sch.id), label, at: nowIso(),
    };
    const history = [...get().history, entry].slice(-40);
    set({ history, future: [] });
  },

  undo() {
    const { history, future, db: current } = get();
    const entry = history[history.length - 1];
    if (!entry) return null;
    const db = clone(current);
    const now: LessonSnapshot = {
      scheduleId: entry.scheduleId, lessons: lessonSnapshot(db, entry.scheduleId), label: entry.label, at: nowIso(),
    };
    db.lessons = db.lessons.filter((l) => l.schedule_id !== entry.scheduleId)
      .concat(entry.lessons.map((l) => ({ ...l })));
    saveDB(db);
    set({ db, history: history.slice(0, -1), future: [...future, now].slice(-40) });
    return entry.label;
  },

  redo() {
    const { history, future, db: current } = get();
    const entry = future[future.length - 1];
    if (!entry) return null;
    const db = clone(current);
    const now: LessonSnapshot = {
      scheduleId: entry.scheduleId, lessons: lessonSnapshot(db, entry.scheduleId), label: entry.label, at: nowIso(),
    };
    db.lessons = db.lessons.filter((l) => l.schedule_id !== entry.scheduleId)
      .concat(entry.lessons.map((l) => ({ ...l })));
    saveDB(db);
    set({ db, future: future.slice(0, -1), history: [...history, now].slice(-40) });
    return entry.label;
  },

  /**
   * نقل حصة إلى خانة أخرى. إن كانت الخانة مشغولة بحصة الشعبة نفسها يتم تبديلهما.
   * يُرفض النقل إذا أنتج تعارضًا صارمًا جديدًا (معلم/شعبة/قاعة/حدود يومية).
   */
  moveLesson(id, dayId, periodId) {
    const db = clone(get().db);
    const lesson = db.lessons.find((l) => l.id === id);
    if (!lesson) throw new Error('الحصة غير موجودة');
    const sid = lesson.schedule_id;
    if (lesson.day_id === dayId && lesson.period_id === periodId) return { ok: true, problems: [] };
    const target = db.lessons.find((l) => l.id !== id && l.schedule_id === sid
      && l.section_id === lesson.section_id && l.day_id === dayId && l.period_id === periodId);
    const before = hardCounts(db, sid);
    const fromDay = lesson.day_id;
    const fromPeriod = lesson.period_id;
    lesson.day_id = dayId;
    lesson.period_id = periodId;
    if (target) {
      target.day_id = fromDay;
      target.period_id = fromPeriod;
    }
    const after = hardCounts(db, sid);
    const problems: string[] = [];
    for (const t of HARD_TYPES) {
      if ((after[t] || 0) > (before[t] || 0)) {
        const detail = clashProblems(db, lesson).concat(target ? clashProblems(db, target) : []);
        problems.push(...(detail.length ? detail : [`الحركة تُنشئ ${HARD_LABEL[t] || t}.`]));
      }
    }
    if (problems.length) {
      return { ok: false, problems: [...new Set(problems)] };
    }
    get().pushHistory(target ? 'تبديل حصتين' : 'نقل حصة');
    saveDB(db);
    set({ db });
    return { ok: true, problems: [], swap: !!target };
  },

  allocateAbsences(date, teacherIds, reason, options = {}) {
    const db = clone(get().db);
    const ctx = enrich(db);
    const sch = activeSchedule(db);
    const lessons = sch ? scheduleLessons(db, sch.id) : [];
    const dayIdx = new Date(`${date}T12:00:00`).getDay() + 1;
    const day = db.days.find((d) => d.idx === dayIdx && d.active !== 0);
    if (!day) throw new Error('التاريخ المختار ليس يومًا دراسيًا نشطًا.');
    const ids = teacherIds.map(Number);
    if (!ids.length) throw new Error('اختر معلمًا غائبًا واحدًا على الأقل.');
    // سجلات الغياب
    const existing = new Set(db.absences.filter((a) => a.date === date).map((a) => Number(a.teacher_id)));
    const absenceByTeacher = new Map<number, number>();
    for (const a of db.absences.filter((a) => a.date === date)) absenceByTeacher.set(Number(a.teacher_id), a.id);
    for (const tid of ids) {
      if (existing.has(tid)) continue;
      const rec = { id: uid(db.absences), date, teacher_id: tid, reason: reason || '', created_at: nowIso() };
      db.absences.push(rec);
      absenceByTeacher.set(tid, rec.id);
    }
    const coverSettings = (() => {
      try { return JSON.parse(db.settings.cover_settings || '{}'); } catch { return {}; }
    })();
    const result = allocateCovers({
      date,
      dayId: day.id,
      lessons,
      teachers: ctx.teachers,
      subjects: ctx.subjects,
      sections: ctx.sections,
      teacherSubjects: db.teacher_subjects,
      existingCovers: db.covers.filter((c) => c.date !== date),
      duties: db.duties,
      absentIds: [...new Set([...ids, ...existing])],
      options: { ...coverSettings, ...options },
    });
    db.covers = db.covers.filter((c) => c.date !== date);
    let cid = uid(db.covers);
    for (const item of result.items) {
      db.covers.push({
        id: cid++, date, absence_id: absenceByTeacher.get(Number(item.absent_teacher_id)) || null,
        lesson_id: item.lesson_id, absent_teacher_id: item.absent_teacher_id,
        substitute_id: item.substitute_id, section_id: item.section_id, subject_id: item.subject_id,
        day_id: day.id, period_id: item.period_id, status: item.status, note: item.note || '',
      });
    }
    db.audit_log.unshift({ id: uid(db.audit_log), username: get().session?.user?.username || 'system', action: 'توزيع غياب', entity: 'absence', details: `${date}: ${result.assigned}/${result.affected}`, created_at: nowIso() });
    saveDB(db);
    set({ db, lastCovers: result });
    return result;
  },

  setCoverSubstitute(coverId, teacherId) {
    const db = clone(get().db);
    const cover = db.covers.find((c) => c.id === coverId);
    if (!cover) throw new Error('سجل الانتظار غير موجود');
    const teacher = db.teachers.find((t) => t.id === teacherId);
    if (!teacher || teacher.active === 0) throw new Error('المعلم غير متاح');
    if (db.absences.some((a) => a.date === cover.date && a.teacher_id === teacherId)) throw new Error('المعلم غائب في هذا اليوم.');
    const sch = activeSchedule(db);
    const lessons = sch ? db.lessons.filter((l) => l.schedule_id === sch.id) : [];
    if (lessons.some((l) => l.teacher_id === teacherId && l.day_id === cover.day_id && l.period_id === cover.period_id)) {
      throw new Error('المعلم مشغول بحصة في هذا الوقت.');
    }
    if (db.duties.some((d) => d.teacher_id === teacherId && d.day_id === cover.day_id && d.period_id === cover.period_id)) {
      throw new Error('المعلم مشغول بمناوبة إشراف في هذا الوقت.');
    }
    if (db.covers.some((c) => c.id !== coverId && c.date === cover.date && c.period_id === cover.period_id && c.substitute_id === teacherId && c.status === 'assigned')) {
      throw new Error('المعلم مكلف بانتظار آخر في نفس الحصة.');
    }
    cover.substitute_id = teacherId;
    cover.status = 'assigned';
    cover.note = '';
    saveDB(db);
    set({ db });
  },

  clearCovers(date) {
    const db = clone(get().db);
    db.covers = db.covers.filter((c) => c.date !== date);
    db.absences = db.absences.filter((a) => a.date !== date);
    saveDB(db);
    set({ db });
  },

  generateDutiesAll(options = {}) {
    const db = clone(get().db);
    const ctx = enrich(db);
    let periodIds: number[] = [];
    try { periodIds = JSON.parse(db.settings.duty_periods || '[]'); } catch { periodIds = []; }
    let periods = ctx.periods.filter((p: any) => (p.kind || 'lesson') === 'lesson');
    if (periodIds.length) periods = ctx.periods.filter((p: any) => periodIds.includes(p.id));
    const sch = activeSchedule(db);
    const lessons = sch ? scheduleLessons(db, sch.id) : [];
    const areaRows = db.supervision_areas.filter((a) => a.active !== 0);
    if (!areaRows.length) throw new Error('أضف مواقع إشراف أولًا.');
    const dutySettings = (() => {
      try { return JSON.parse(db.settings.duty_settings || '{}'); } catch { return {}; }
    })();
    const result = generateDuties({
      areas: areaRows, days: ctx.days, periods, teachers: ctx.teachers, lessons,
      existing: [], options: { ...dutySettings, ...options },
    });
    let id = 1;
    db.duties = result.duties.map((d: any) => ({ ...d, id: id++ }));
    db.audit_log.unshift({ id: uid(db.audit_log), username: get().session?.user?.username || 'system', action: 'توليد إشراف', entity: 'duty', details: `${db.duties.length} مناوبة`, created_at: nowIso() });
    saveDB(db);
    set({ db });
    return result;
  },

  updateDuty(id, patch) {
    const db = clone(get().db);
    const duty = db.duties.find((d) => d.id === id);
    if (!duty) throw new Error('المناوبة غير موجودة');
    if (patch.teacher_id) {
      const sch = activeSchedule(db);
      const lessons = sch ? db.lessons.filter((l) => l.schedule_id === sch.id) : [];
      if (lessons.some((l) => l.teacher_id === Number(patch.teacher_id) && l.day_id === duty.day_id && l.period_id === duty.period_id)) {
        throw new Error('المعلم مشغول بحصة في هذه الفترة.');
      }
    }
    Object.assign(duty, patch);
    saveDB(db);
    set({ db });
  },

  importCalendar(events) {
    const db = clone(get().db);
    let added = 0;
    let skipped = 0;
    for (const e of events) {
      const title = e.title || e['العنوان'] || '';
      const start = e.start_date || e.start || '';
      const end = e.end_date || e.end || start;
      if (!title || !start) continue;
      const dup = db.calendar_events.some((x) => x.title === title && x.start_date === start && x.end_date === end);
      if (dup) { skipped += 1; continue; }
      db.calendar_events.push({ id: uid(db.calendar_events), title, type: e.type || 'other', start_date: start, end_date: end, note: e.note || '' });
      added += 1;
    }
    saveDB(db);
    set({ db });
    return { added, skipped };
  },

  setPermission(role, module, level) {
    const db = clone(get().db);
    if (!db.permissions[role]) db.permissions[role] = {};
    db.permissions[role][module] = level as any;
    saveDB(db);
    set({ db });
  },

  setSetting(key, value) {
    const db = clone(get().db);
    db.settings[key] = value;
    saveDB(db);
    set({ db });
  },

  setDayActive(id, active) {
    const db = clone(get().db);
    const day = db.days.find((d) => d.id === id);
    if (day) day.active = active ? 1 : 0;
    saveDB(db);
    set({ db });
  },

  setPeriodActive(id, active) {
    const db = clone(get().db);
    const period = db.periods.find((p) => p.id === id);
    if (period) period.active = active ? 1 : 0;
    saveDB(db);
    set({ db });
  },

  backup() {
    return exportDB(get().db);
  },

  restore(text) {
    const db = parseBackup(text);
    saveDB(db);
    set({ db });
  },

  async resetDemo() {
    clearSession();
    const db = normalizeSeed();
    for (const user of db.users) {
      const demo = DEMO_USERS.find((d) => d.username === user.username);
      if (demo) user.password_hash = await hashPassword(demo.password);
    }
    saveDB(db);
    set({ db, session: null, lastCovers: null });
  },

  async setPassword(userId, password) {
    if (String(password).length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    const db = clone(get().db);
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error('المستخدم غير موجود');
    user.password_hash = await hashPassword(password);
    saveDB(db);
    set({ db });
  },

  log(action, entity, details) {
    const db = clone(get().db);
    db.audit_log.unshift({
      id: uid(db.audit_log), username: get().session?.user?.username || 'system',
      action, entity: entity || '', details: details || '', created_at: nowIso(),
    });
    if (db.audit_log.length > 500) db.audit_log.length = 500;
    saveDB(db);
    set({ db });
  },
}));

export function usePerm(module: string, need: 'none' | 'view' | 'edit' = 'view') {
  const db = useApp((s) => s.db);
  const session = useApp((s) => s.session);
  if (!session) return false;
  const order: Record<string, number> = { none: 0, view: 1, edit: 2 };
  const level = db.permissions?.[session.role]?.[module] || 'none';
  return (order[level] || 0) >= (order[need] || 0);
}

export type { AppState };
