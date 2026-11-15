import type { DB, Lesson, Schedule } from '../types';

export const uid = (rows: { id: number }[]): number =>
  rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;

export const nowIso = () => new Date().toISOString();
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function fmtDate(value?: string | null): string {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(value);
}

/** يعيد رقم اليوم الدراسي (1 = الأحد) لتاريخ ميلادي. */
export function dayIdxForDate(date: string): number {
  const d = new Date(`${date}T12:00:00`);
  return d.getDay() + 1;
}

export function activeSchedule(db: DB): Schedule | undefined {
  const id = Number(db.settings?.active_schedule || 0);
  const byId = db.schedules.find((s) => s.id === id);
  return byId || db.schedules.find((s) => s.status === 'published') || db.schedules[0];
}

export function scheduleLessons(db: DB, scheduleId?: number): any[] {
  const sch = scheduleId ? db.schedules.find((s) => s.id === scheduleId) : activeSchedule(db);
  if (!sch) return [];
  const subjects = new Map(db.subjects.map((s) => [s.id, s]));
  const teachers = new Map(db.teachers.map((t) => [t.id, t]));
  const sections = new Map(db.sections.map((s) => [s.id, s]));
  const grades = new Map(db.grades.map((g) => [g.id, g]));
  const rooms = new Map(db.rooms.map((r) => [r.id, r]));
  const days = new Map(db.days.map((d) => [d.id, d]));
  const periods = new Map(db.periods.map((p) => [p.id, p]));
  const rows = db.lessons.filter((l) => l.schedule_id === sch.id).map((l) => {
    const sec = sections.get(l.section_id);
    const sub = subjects.get(l.subject_id);
    return {
      ...l,
      subject_name: sub?.name || '',
      subject_color: sub?.color || '#6366f1',
      teacher_name: teachers.get(Number(l.teacher_id))?.name || '',
      section_name: sec?.name || '',
      grade_id: sec?.grade_id,
      grade_name: grades.get(Number(sec?.grade_id))?.name || '',
      room_name: rooms.get(Number(l.room_id))?.name || '',
      day_name: days.get(l.day_id)?.name || '',
      period_name: periods.get(l.period_id)?.name || '',
      period_idx: periods.get(l.period_id)?.idx || 0,
    };
  });
  return rows.sort((a, b) => (days.get(a.day_id)?.idx || 0) - (days.get(b.day_id)?.idx || 0)
    || (periods.get(a.period_id)?.idx || 0) - (periods.get(b.period_id)?.idx || 0));
}

/** سياق العمل: نفس أسماء الحقول التي تتوقعها خدمات الجدولة والتعارضات والتقارير. */
export function enrich(db: DB): any {
  const school = db.school;
  const days = db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx);
  const periods = db.periods.filter((p) => p.active !== 0).sort((a, b) => a.idx - b.idx);
  const rooms = db.rooms.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const grades = db.grades.slice().sort((a, b) => (a.ord || 0) - (b.ord || 0));
  const gradeById = new Map(grades.map((g) => [g.id, g]));
  const sections = db.sections
    .filter((s) => s.active !== 0)
    .map((s) => ({ ...s, grade_name: gradeById.get(s.grade_id)?.name || '', max_daily: school.max_daily_section || 7 }))
    .sort((a, b) => (a.grade_id - b.grade_id) || a.name.localeCompare(b.name, 'ar'));
  const subjects = db.subjects.filter((s) => s.active !== 0).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const teachers = db.teachers.filter((t) => t.active !== 0).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const subjectById = new Map(db.subjects.map((s) => [s.id, s]));
  const teacherById = new Map(db.teachers.map((t) => [t.id, t]));
  const sectionById = new Map(db.sections.map((s) => [s.id, s]));
  const assignments = db.assignments.map((a) => {
    const sub = subjectById.get(a.subject_id) || ({} as any);
    const t = teacherById.get(Number(a.teacher_id)) || ({} as any);
    const sec = sectionById.get(a.section_id) || ({} as any);
    return {
      ...a,
      subject_name: sub.name || '',
      subject_color: sub.color || '#6366f1',
      max_per_day: sub.max_per_day || 1,
      consecutive: sub.consecutive || 0,
      needs_lab: sub.needs_lab || 0,
      teacher_name: t.name || '',
      teacher_max_daily: t.max_daily,
      teacher_weekly_load: t.weekly_load,
      section_name: sec.name || '',
      grade_id: sec.grade_id,
      section_room_id: sec.room_id,
      grade_name: gradeById.get(Number(sec.grade_id))?.name || '',
    };
  }).sort((a, b) => (a.grade_id - b.grade_id) || String(a.section_name).localeCompare(String(b.section_name), 'ar'));
  return {
    school,
    days,
    periods,
    rooms,
    grades,
    sections,
    subjects,
    teachers,
    teacherSubjects: db.teacher_subjects,
    unavailable: db.teacher_unavailable,
    assignments,
  };
}

export function buildSchedulerInput(ctx: any, options: Record<string, unknown> = {}, locked: Lesson[] = [], maxDailySection?: number) {
  const assignments = ctx.assignments
    .filter((a: any) => Number(a.weekly_periods) > 0)
    .map((a: any) => ({
      ...a,
      unavailable: ctx.unavailable
        .filter((u: any) => u.teacher_id === a.teacher_id)
        .map((u: any) => [u.day_id, u.period_id]),
    }));
  return {
    days: ctx.days,
    periods: ctx.periods,
    teachers: ctx.teachers,
    subjects: ctx.subjects,
    sections: ctx.sections,
    rooms: ctx.rooms,
    assignments,
    locked,
    options: {
      sectionMaxDaily: maxDailySection || ctx.school?.max_daily_section || 7,
      ...options,
    },
  };
}

export function activeCtx(db: DB): any {
  const ctx = enrich(db);
  const sch = activeSchedule(db);
  return { ...ctx, lessons: sch ? scheduleLessons(db, sch.id) : [], schedule: sch };
}

export function can(permissions: any, role: string, module: string, need: 'none' | 'view' | 'edit' = 'view'): boolean {
  const order: Record<string, number> = { none: 0, view: 1, edit: 2 };
  const level = permissions?.[role]?.[module] || 'none';
  return (order[level] || 0) >= (order[need] || 0);
}

export function className(value?: string | null): string {
  return value || '';
}

export const WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
