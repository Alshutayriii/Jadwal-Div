'use strict';
/**
 * توزيع حصص الانتظار وتغطية غياب المعلمين.
 * القواعد: بديل غير غائب، فاضٍ في نفس الحصة، لم يُكلّف انتظارًا آخر في نفس الوقت،
 * ضمن سقف الانتظار اليومي والأسبوعي، مع تفضيل التخصص، وعدم التعارض مع الإشراف.
 */

function allocateCovers(input) {
  const {
    date,
    dayId,
    lessons = [],
    teachers = [],
    subjects = [],
    sections = [],
    teacherSubjects = [],
    existingCovers = [],
    duties = [],
    absentIds = [],
    options = {},
  } = input;

  const maxPerDay = options.maxPerDay || 2;
  const maxPerWeek = options.maxPerWeek || 5;
  const maxDailyTeaching = options.maxDailyTeaching || 7;
  const absent = new Set(absentIds.map(Number));
  const qualified = new Set(teacherSubjects.map(x => `${x.teacher_id}|${x.subject_id}`));
  const subjectById = new Map(subjects.map(s => [s.id, s]));
  const sectionById = new Map(sections.map(s => [s.id, s]));
  const teacherById = new Map(teachers.map(t => [t.id, t]));

  const teaching = new Set(
    lessons.filter(l => l.teacher_id && l.day_id === dayId).map(l => `${l.teacher_id}|${l.period_id}`)
  );
  const busyDuty = new Set(
    duties.filter(d => d.day_id === dayId && d.teacher_id).map(d => `${d.teacher_id}|${d.period_id}`)
  );
  const coverSlots = new Set();
  const perDay = new Map();
  const perWeek = new Map();
  const teachingToday = new Map();
  // حدود الأسبوع الدراسي (الأحد → الخميس) لاحتساب السقف الأسبوعي بدقة.
  const weekStartDate = new Date(`${date}T12:00:00`);
  weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay());
  const weekStart = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`;
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 4);
  const weekEnd = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, '0')}-${String(weekEndDate.getDate()).padStart(2, '0')}`;
  for (const c of existingCovers) {
    if (c.status === 'assigned' && c.substitute_id) {
      if (c.date === date) {
        coverSlots.add(`${c.substitute_id}|${c.period_id}`);
        perDay.set(c.substitute_id, (perDay.get(c.substitute_id) || 0) + 1);
      }
      if (c.date >= weekStart && c.date <= weekEnd) {
        perWeek.set(c.substitute_id, (perWeek.get(c.substitute_id) || 0) + 1);
      }
    }
  }
  for (const l of lessons) {
    if (l.teacher_id && l.day_id === dayId) {
      teachingToday.set(l.teacher_id, (teachingToday.get(l.teacher_id) || 0) + 1);
    }
  }

  const affected = lessons.filter(l => l.day_id === dayId && absent.has(Number(l.teacher_id)));
  const items = [];

  const ordered = affected.slice().sort((a, b) => {
    const ta = teacherById.get(a.teacher_id)?.name || '';
    const tb = teacherById.get(b.teacher_id)?.name || '';
    return ta.localeCompare(tb, 'ar') || a.period_id - b.period_id;
  });

  for (const lesson of ordered) {
    const subject = subjectById.get(lesson.subject_id) || {};
    const section = sectionById.get(lesson.section_id) || {};
    const candidates = [];
    for (const t of teachers) {
      if (!t.active) continue;
      if (absent.has(t.id)) continue;
      if (t.id === lesson.teacher_id) continue;
      if (teaching.has(`${t.id}|${lesson.period_id}`)) continue;
      if (coverSlots.has(`${t.id}|${lesson.period_id}`)) continue;
      if (busyDuty.has(`${t.id}|${lesson.period_id}`)) continue;
      if ((perDay.get(t.id) || 0) >= maxPerDay) continue;
      if ((perWeek.get(t.id) || 0) >= maxPerWeek) continue;
      if ((teachingToday.get(t.id) || 0) >= maxDailyTeaching) continue;

      const isQualified = qualified.has(`${t.id}|${lesson.subject_id}`);
      const specMatch = t.specialty && subject.name && (t.specialty.includes(subject.name) || subject.name.includes(t.specialty));
      let score = 0;
      const reasons = [];
      if (isQualified) { score += 12; reasons.push('مؤهل للمادة'); }
      else if (specMatch) { score += 6; reasons.push('تخصص قريب'); }
      score -= (perDay.get(t.id) || 0) * 2;
      score -= (perWeek.get(t.id) || 0) * 0.5;
      score -= (teachingToday.get(t.id) || 0) * 0.25;
      candidates.push({
        teacher_id: t.id,
        name: t.name,
        score: Number(score.toFixed(2)),
        qualified: isQualified,
        specialty: t.specialty,
        notes: reasons,
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ar'));
    const top = candidates[0];
    const status = top ? 'assigned' : 'unfilled';
    if (top) {
      coverSlots.add(`${top.teacher_id}|${lesson.period_id}`);
      perDay.set(top.teacher_id, (perDay.get(top.teacher_id) || 0) + 1);
      perWeek.set(top.teacher_id, (perWeek.get(top.teacher_id) || 0) + 1);
    }
    items.push({
      lesson_id: lesson.id,
      period_id: lesson.period_id,
      section_id: lesson.section_id,
      section_name: section.name || '',
      subject_id: lesson.subject_id,
      subject_name: subject.name || '',
      absent_teacher_id: lesson.teacher_id,
      absent_teacher_name: teacherById.get(lesson.teacher_id)?.name || '',
      room_id: lesson.room_id,
      substitute_id: top ? top.teacher_id : null,
      substitute_name: top ? top.name : null,
      status,
      candidates: candidates.slice(0, 6),
      note: top ? '' : 'لا يوجد معلم فاضٍ ضمن السقوف في هذه الحصة',
    });
  }

  const assigned = items.filter(i => i.status === 'assigned').length;
  return {
    date,
    day_id: dayId,
    items,
    assigned,
    unfilled: items.length - assigned,
    affected: items.length,
  };
}

export { allocateCovers };
