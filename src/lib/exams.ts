import type { DB, Exam } from '../types';

export const EXAM_ISSUE_LABEL: Record<string, string> = {
  section_clash: 'تعارض شعبة',
  room_clash: 'تعارض قاعة',
  invigilator_clash: 'تعارض مراقب',
  unavailable: 'مراقب غير متاح',
  daily_limit: 'تجاوز حد الاختبارات اليومي',
  subject_repeat: 'تكرار المادة في اليوم',
  missing_room: 'قاعة غير محددة',
  missing_invigilator: 'مراقب غير محدد',
};

export interface ExamIssue {
  id: string;
  severity: 'error' | 'warning';
  type: string;
  title: string;
  message: string;
  examId?: number;
  day_id?: number;
  period_id?: number;
}

export interface ExamOptions {
  subjectIds?: number[];
  gradeIds?: number[];
  maxPerDay?: number;
  periodsPerDay?: number;
}

export function examSettings(db: DB): { maxPerDay: number; periodsPerDay: number } {
  try {
    const raw = JSON.parse(db.settings?.exam_settings || '{}');
    return {
      maxPerDay: Math.max(1, Number(raw.maxPerDay) || 3),
      periodsPerDay: Math.max(1, Number(raw.periodsPerDay) || 3),
    };
  } catch {
    return { maxPerDay: 3, periodsPerDay: 3 };
  }
}

export function examPeriods(db: DB) {
  const n = examSettings(db).periodsPerDay;
  return db.periods.filter((p) => p.active !== 0 && (p.kind || 'lesson') === 'lesson')
    .sort((a, b) => a.idx - b.idx).slice(0, n);
}

function sectionRoom(db: DB, sectionId?: number | null): number | null {
  if (!sectionId) return null;
  return db.sections.find((s) => s.id === sectionId)?.room_id ?? null;
}

/** يتحقق من تعارضات جدول الاختبارات الحالي. */
export function examConflicts(db: DB, exams: Exam[] = db.exams || []): { issues: ExamIssue[]; errors: number; warnings: number } {
  const issues: ExamIssue[] = [];
  const { maxPerDay } = examSettings(db);
  const days = new Map(db.days.map((d) => [d.id, d]));
  const periods = new Map(db.periods.map((p) => [p.id, p]));
  const sections = new Map(db.sections.map((s) => [s.id, s]));
  const grades = new Map(db.grades.map((g) => [g.id, g]));
  const subjects = new Map(db.subjects.map((s) => [s.id, s]));
  const teachers = new Map(db.teachers.map((t) => [t.id, t]));
  const rooms = new Map(db.rooms.map((r) => [r.id, r]));
  const unavailable = new Set((db.teacher_unavailable || []).map((u) => `${u.teacher_id}|${u.day_id}|${u.period_id}`));
  let seq = 1;
  const push = (severity: 'error' | 'warning', type: string, message: string, exam?: Exam) => {
    issues.push({
      id: `ex${seq++}`, severity, type, title: EXAM_ISSUE_LABEL[type] || type, message,
      examId: exam?.id, day_id: exam?.day_id, period_id: exam?.period_id,
    });
  };
  const slot = (e: Exam) => `${days.get(e.day_id)?.name || 'يوم'} — ${periods.get(e.period_id)?.name || 'حصة'}`;
  const secName = (e: Exam) => {
    const s = sections.get(Number(e.section_id));
    return s ? `${grades.get(s.grade_id)?.name || ''} ${s.name}`.trim() : 'شعبة';
  };
  const subName = (e: Exam) => subjects.get(e.subject_id)?.name || 'مادة';

  const bySection = new Map<string, Exam[]>();
  const byRoom = new Map<string, Exam[]>();
  const byTeacher = new Map<string, Exam[]>();
  const byDayCount = new Map<string, number>();
  const bySubjectDay = new Map<string, Exam[]>();

  for (const e of exams) {
    const sec = Number(e.section_id) || 0;
    const room = Number(e.room_id) || Number(sectionRoom(db, e.section_id)) || 0;
    const key = `${e.day_id}|${e.period_id}`;
    if (sec) {
      if (!bySection.has(`${sec}|${key}`)) bySection.set(`${sec}|${key}`, []);
      bySection.get(`${sec}|${key}`)!.push(e);
      const dk = `${sec}|${e.day_id}`;
      byDayCount.set(dk, (byDayCount.get(dk) || 0) + 1);
      const sk = `${sec}|${e.subject_id}|${e.day_id}`;
      if (!bySubjectDay.has(sk)) bySubjectDay.set(sk, []);
      bySubjectDay.get(sk)!.push(e);
    }
    if (room) {
      if (!byRoom.has(`${room}|${key}`)) byRoom.set(`${room}|${key}`, []);
      byRoom.get(`${room}|${key}`)!.push(e);
    }
    if (e.invigilator_id) {
      const tk = `${e.invigilator_id}|${key}`;
      if (!byTeacher.has(tk)) byTeacher.set(tk, []);
      byTeacher.get(tk)!.push(e);
      if (unavailable.has(`${e.invigilator_id}|${e.day_id}|${e.period_id}`)) {
        const t = teachers.get(Number(e.invigilator_id));
        push('error', 'unavailable', `المراقب ${t?.name || ''} غير متاح في ${slot(e)} (${secName(e)}).`, e);
      }
    } else {
      push('warning', 'missing_invigilator', `اختبار ${subName(e)} — ${secName(e)} في ${slot(e)} بلا مراقب.`, e);
    }
    if (!room) {
      push('warning', 'missing_room', `اختبار ${subName(e)} — ${secName(e)} في ${slot(e)} بلا قاعة.`, e);
    }
  }

  for (const [, list] of bySection) {
    if (list.length > 1) {
      push('error', 'section_clash', `الشعبة ${secName(list[0])} لديها ${list.length} اختبارات في ${slot(list[0])}.`, list[0]);
    }
  }
  for (const [key, list] of byRoom) {
    if (list.length > 1) {
      const roomId = Number(key.split('|')[0]);
      push('error', 'room_clash', `القاعة ${rooms.get(roomId)?.name || ''} محجوزة لاختبارين في ${slot(list[0])}.`, list[0]);
    }
  }
  for (const [, list] of byTeacher) {
    if (list.length > 1) {
      const t = teachers.get(Number(list[0].invigilator_id));
      push('error', 'invigilator_clash', `المراقب ${t?.name || ''} مكلّف بأكثر من اختبار في ${slot(list[0])}.`, list[0]);
    }
  }
  for (const [key, count] of byDayCount) {
    if (count > maxPerDay) {
      const [secId, dayId] = key.split('|').map(Number);
      const s = sections.get(secId);
      push('warning', 'daily_limit', `الشعبة ${s?.name || ''} لديها ${count} اختبارات يوم ${days.get(dayId)?.name || ''} (الحد ${maxPerDay}).`);
    }
  }
  for (const [, list] of bySubjectDay) {
    if (list.length > 1) {
      push('warning', 'subject_repeat', `المادة ${subName(list[0])} مكررة ${list.length} مرات للشعبة ${secName(list[0])} في اليوم نفسه.`, list[0]);
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  return { issues, errors, warnings: issues.length - errors };
}

/** توزيع الاختبارات تلقائيًا على أول حصص اليوم مع مراعاة القاعات والمراقبين. */
export function generateExams(db: DB, options: ExamOptions = {}): {
  exams: Exam[];
  placed: number;
  unplaced: { section_id: number; subject_id: number; reason: string }[];
  issues: ExamIssue[];
} {
  const { maxPerDay } = examSettings(db);
  const periods = examPeriods(db);
  const days = db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx);
  const sections = db.sections.filter((s) => s.active !== 0)
    .filter((s) => !options.gradeIds?.length || options.gradeIds.includes(s.grade_id))
    .sort((a, b) => a.grade_id - b.grade_id || a.name.localeCompare(b.name, 'ar'));
  const subjects = db.subjects.filter((s) => s.active !== 0)
    .filter((s) => !options.subjectIds?.length || options.subjectIds.includes(s.id))
    .sort((a, b) => (b.weekly_periods || 0) - (a.weekly_periods || 0));
  const teachers = db.teachers.filter((t) => t.active !== 0);
  const qualified = new Set((db.teacher_subjects || []).map((x) => `${x.teacher_id}|${x.subject_id}`));
  const unavailable = new Set((db.teacher_unavailable || []).map((u) => `${u.teacher_id}|${u.day_id}|${u.period_id}`));
  const rooms = db.rooms.slice();
  const exams: Exam[] = [];
  const unplaced: { section_id: number; subject_id: number; reason: string }[] = [];
  const sectionDay = new Map<string, number>();
  const sectionSlot = new Set<string>();
  const roomSlot = new Set<string>();
  const teacherSlot = new Set<string>();
  const teacherCount = new Map<number, number>();
  const usedRooms = new Map<number, number>();

  const isQualified = (teacherId: number, subjectId: number) => {
    if (qualified.has(`${teacherId}|${subjectId}`)) return true;
    const t = teachers.find((x) => x.id === teacherId);
    const s = db.subjects.find((x) => x.id === subjectId);
    if (!t || !s) return false;
    return Boolean(t.specialty && (s.name.includes(t.specialty) || t.specialty.includes(s.name)));
  };

  const pickRoom = (sectionId: number, subjectId: number, dayId: number, periodId: number): number | null => {
    const subject = db.subjects.find((s) => s.id === subjectId);
    const section = db.sections.find((s) => s.id === sectionId);
    const preferred = Number(section?.room_id) || null;
    const needsLab = Boolean(subject?.needs_lab);
    const candidates = rooms.filter((r) => {
      if (needsLab && !['lab', 'computer'].includes(r.kind)) return false;
      if (!needsLab && !['class', 'other'].includes(r.kind) && preferred !== r.id) return false;
      return !roomSlot.has(`${r.id}|${dayId}|${periodId}`);
    });
    if (preferred && candidates.some((r) => r.id === preferred)) return preferred;
    if (preferred && !roomSlot.has(`${preferred}|${dayId}|${periodId}`)) return preferred;
    const free = candidates.filter((r) => r.id !== preferred).sort((a, b) => {
      const ua = usedRooms.get(a.id) || 0;
      const ub = usedRooms.get(b.id) || 0;
      return ua - ub || String(a.name).localeCompare(String(b.name), 'ar');
    });
    return free[0]?.id ?? null;
  };

  const pickInvigilator = (subjectId: number, dayId: number, periodId: number): number | null => {
    const candidates = teachers.filter((t) => {
      if (unavailable.has(`${t.id}|${dayId}|${periodId}`)) return false;
      if (teacherSlot.has(`${t.id}|${dayId}|${periodId}`)) return false;
      return true;
    });
    const ranked = candidates.sort((a, b) => {
      const qa = isQualified(a.id, subjectId) ? 0 : 1;
      const qb = isQualified(b.id, subjectId) ? 0 : 1;
      const ca = teacherCount.get(a.id) || 0;
      const cb = teacherCount.get(b.id) || 0;
      return qa - qb || ca - cb || String(a.name).localeCompare(String(b.name), 'ar');
    });
    return ranked[0]?.id ?? null;
  };

  // إزاحة البداية لكل شعبة لتوزيع الاختبارات على الحصص بدل تكديسها في الحصة الأولى.
  let sectionIndex = 0;
  for (const section of sections) {
    const offset = sectionIndex++ % Math.max(1, periods.length);
    for (const subject of subjects) {
      let placed = false;
      let reason = 'لا توجد خانة مناسبة';
      for (let d = 0; d < days.length && !placed; d += 1) {
        const day = days[d];
        if ((sectionDay.get(`${section.id}|${day.id}`) || 0) >= maxPerDay) continue;
        for (let p = 0; p < periods.length && !placed; p += 1) {
          const period = periods[(p + offset) % periods.length];
          const slotKey = `${section.id}|${day.id}|${period.id}`;
          if (sectionSlot.has(slotKey)) continue;
          const roomId = pickRoom(section.id, subject.id, day.id, period.id);
          if (!roomId) { reason = 'لا توجد قاعة متاحة'; continue; }
          const invigilatorId = pickInvigilator(subject.id, day.id, period.id);
          if (!invigilatorId) { reason = 'لا يوجد مراقب متاح'; continue; }
          exams.push({
            id: 0, subject_id: subject.id, grade_id: section.grade_id, section_id: section.id,
            day_id: day.id, period_id: period.id, room_id: roomId, invigilator_id: invigilatorId,
            duration: 60, notes: '',
          });
          sectionSlot.add(slotKey);
          roomSlot.add(`${roomId}|${day.id}|${period.id}`);
          teacherSlot.add(`${invigilatorId}|${day.id}|${period.id}`);
          teacherCount.set(invigilatorId, (teacherCount.get(invigilatorId) || 0) + 1);
          usedRooms.set(roomId, (usedRooms.get(roomId) || 0) + 1);
          sectionDay.set(`${section.id}|${day.id}`, (sectionDay.get(`${section.id}|${day.id}`) || 0) + 1);
          placed = true;
        }
      }
      if (!placed) unplaced.push({ section_id: section.id, subject_id: subject.id, reason });
    }
  }

  const preview = examConflicts(db, exams);
  return { exams, placed: exams.length, unplaced, issues: preview.issues };
}

/** تصدير جدول الاختبارات إلى CSV بترميز عربي. */
export function examsCsv(db: DB, exams: Exam[] = db.exams || []): string {
  const days = new Map(db.days.map((d) => [d.id, d]));
  const periods = new Map(db.periods.map((p) => [p.id, p]));
  const subjects = new Map(db.subjects.map((s) => [s.id, s]));
  const sections = new Map(db.sections.map((s) => [s.id, s]));
  const grades = new Map(db.grades.map((g) => [g.id, g]));
  const rooms = new Map(db.rooms.map((r) => [r.id, r]));
  const teachers = new Map(db.teachers.map((t) => [t.id, t]));
  const head = ['اليوم', 'الحصة', 'الصف', 'الشعبة', 'المادة', 'القاعة', 'المراقب', 'المدة', 'ملاحظات'];
  const lines = [head.join(',')];
  const sorted = exams.slice().sort((a, b) => (days.get(a.day_id)?.idx || 0) - (days.get(b.day_id)?.idx || 0)
    || (periods.get(a.period_id)?.idx || 0) - (periods.get(b.period_id)?.idx || 0)
    || String(grades.get(Number(sections.get(Number(a.section_id))?.grade_id))?.name || '').localeCompare(String(grades.get(Number(sections.get(Number(b.section_id))?.grade_id))?.name || ''), 'ar'));
  for (const e of sorted) {
    const sec = sections.get(Number(e.section_id));
    const row = [
      days.get(e.day_id)?.name || '', periods.get(e.period_id)?.name || '',
      grades.get(Number(sec?.grade_id))?.name || '', sec?.name || '',
      subjects.get(e.subject_id)?.name || '', rooms.get(Number(e.room_id))?.name || '',
      teachers.get(Number(e.invigilator_id))?.name || '', String(e.duration || ''), e.notes || '',
    ].map((v) => {
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    });
    lines.push(row.join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}
