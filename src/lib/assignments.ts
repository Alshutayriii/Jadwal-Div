import type { Assignment, DB } from '../types';

export interface AutoAssignOptions {
  overwrite?: boolean;
  respectLoad?: boolean;
  preferQualified?: boolean;
}

export interface AutoAssignResult {
  assigned: number;
  skipped: number;
  changed: Assignment[];
  unresolved: { assignment: Assignment; reason: string }[];
}

function specialtyMatch(teacherSpecialty: string, subjectName: string): boolean {
  const a = String(teacherSpecialty || '').trim();
  const b = String(subjectName || '').trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * يوزّع المعلمين على الإسنادات حسب المؤهل (teacher_subjects) والتخصص والنصاب المتبقي.
 * لا يغيّر إسنادًا له معلم إلا إذا طُلب الاستبدال صراحةً.
 */
export function autoAssignTeachers(db: DB, options: AutoAssignOptions = {}): AutoAssignResult {
  const overwrite = Boolean(options.overwrite);
  const respectLoad = options.respectLoad !== false;
  const preferQualified = options.preferQualified !== false;
  const qualified = new Set((db.teacher_subjects || []).map((x) => `${x.teacher_id}|${x.subject_id}`));
  const teachers = db.teachers.filter((t) => t.active !== 0);
  const subjects = new Map(db.subjects.map((s) => [s.id, s]));
  const load = new Map<number, number>();
  for (const a of db.assignments) {
    if (a.teacher_id) load.set(Number(a.teacher_id), (load.get(Number(a.teacher_id)) || 0) + Number(a.weekly_periods || 0));
  }

  const changed: Assignment[] = [];
  const unresolved: { assignment: Assignment; reason: string }[] = [];
  let skipped = 0;

  const targets = db.assignments
    .filter((a) => overwrite || !a.teacher_id)
    .slice()
    .sort((a, b) => Number(b.weekly_periods || 0) - Number(a.weekly_periods || 0));

  for (const assignment of targets) {
    const subject = subjects.get(assignment.subject_id);
    const current = Number(assignment.teacher_id) || 0;
    if (current) {
      load.set(current, Math.max(0, (load.get(current) || 0) - Number(assignment.weekly_periods || 0)));
    }
    const candidates = teachers
      .map((t) => {
        const used = load.get(t.id) || 0;
        const remaining = Number(t.weekly_load || 0) - used;
        const isQualified = qualified.has(`${t.id}|${assignment.subject_id}`)
          || specialtyMatch(t.specialty, subject?.name || '');
        return { teacher: t, used, remaining, isQualified };
      })
      .filter((c) => !preferQualified || c.isQualified)
      .filter((c) => !respectLoad || c.remaining >= Number(assignment.weekly_periods || 0))
      .sort((a, b) => {
        if (a.isQualified !== b.isQualified) return a.isQualified ? -1 : 1;
        if (a.remaining !== b.remaining) return b.remaining - a.remaining;
        if (a.used !== b.used) return a.used - b.used;
        return a.teacher.name.localeCompare(b.teacher.name, 'ar');
      });

    const pick = candidates[0];
    if (!pick) {
      if (current) load.set(current, (load.get(current) || 0) + Number(assignment.weekly_periods || 0));
      unresolved.push({
        assignment,
        reason: respectLoad
          ? 'لا يوجد معلم مؤهل لديه نصاب متبقٍ كافٍ.'
          : 'لا يوجد معلم مؤهل لهذه المادة.',
      });
      continue;
    }
    if (Number(assignment.teacher_id) === pick.teacher.id) {
      load.set(pick.teacher.id, (load.get(pick.teacher.id) || 0) + Number(assignment.weekly_periods || 0));
      skipped += 1;
      continue;
    }
    load.set(pick.teacher.id, (load.get(pick.teacher.id) || 0) + Number(assignment.weekly_periods || 0));
    changed.push({ ...assignment, teacher_id: pick.teacher.id });
  }

  return { assigned: changed.length, skipped, changed, unresolved };
}
