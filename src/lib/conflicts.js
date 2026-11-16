'use strict';
/**
 * كشف التعارضات — يعمل على بيانات جاهزة (بدون قاعدة بيانات) ليمكن اختباره.
 */

const TYPE_LABELS = {
  teacher_clash: 'تعارض معلم',
  section_clash: 'تعارض شعبة',
  room_clash: 'تعارض قاعة/معمل',
  unplaced: 'حصص غير موزعة',
  no_teacher: 'إسناد بلا معلم',
  teacher_overload: 'تجاوز النصاب الأسبوعي',
  teacher_daily: 'تجاوز الحد اليومي للمعلم',
  section_daily: 'تجاوز سقف اليوم للشعبة',
  unqualified: 'معلم غير مؤهل للمادة',
  unavailable: 'معلم غير متاح',
  subject_repeat: 'تكرار المادة في اليوم',
  lab_missing: 'مادة تحتاج معملًا',
  consecutive: 'تجاوز التجاور المسموح',
};

function detect(ctx) {
  const days = new Map((ctx.days || []).map(d => [d.id, d]));
  const periods = new Map((ctx.periods || []).map(p => [p.id, p]));
  const teachers = new Map((ctx.teachers || []).map(t => [t.id, t]));
  const subjects = new Map((ctx.subjects || []).map(s => [s.id, s]));
  const sections = new Map((ctx.sections || []).map(s => [s.id, s]));
  const rooms = new Map((ctx.rooms || []).map(r => [r.id, r]));
  const lessons = ctx.lessons || [];
  const assignments = ctx.assignments || [];
  const school = ctx.school || {};
  const qualified = new Set((ctx.teacherSubjects || []).map(x => `${x.teacher_id}|${x.subject_id}`));
  const unavailable = new Set((ctx.unavailable || []).map(x => `${x.teacher_id}|${x.day_id}|${x.period_id}`));

  const conflicts = [];
  let seq = 0;
  const push = (c) => conflicts.push(Object.assign({
    id: `c${++seq}`,
    severity: 'error',
    day_id: null,
    period_id: null,
  }, c));

  const label = (prefix, id) => {
    if (prefix === 't') { const t = teachers.get(id); return t ? t.name : '—'; }
    if (prefix === 's') { const s = sections.get(id); return s ? s.name : '—'; }
    if (prefix === 'sub') { const s = subjects.get(id); return s ? s.name : '—'; }
    if (prefix === 'r') { const r = rooms.get(id); return r ? r.name : '—'; }
    if (prefix === 'd') { const d = days.get(id); return d ? d.name : '—'; }
    if (prefix === 'p') { const p = periods.get(id); return p ? p.name : '—'; }
    return '—';
  };

  const slotLabel = (dayId, periodId) => `${label('d', dayId)} — ${label('p', periodId)}`;

  // 1) تعارضات الخانات
  const byTeacher = new Map();
  const bySection = new Map();
  const byRoom = new Map();
  for (const l of lessons) {
    if (l.teacher_id) {
      const k = `${l.teacher_id}|${l.day_id}|${l.period_id}`;
      if (!byTeacher.has(k)) byTeacher.set(k, []);
      byTeacher.get(k).push(l);
    }
    const ks = `${l.section_id}|${l.day_id}|${l.period_id}`;
    if (!bySection.has(ks)) bySection.set(ks, []);
    bySection.get(ks).push(l);
    if (l.room_id) {
      const kr = `${l.room_id}|${l.day_id}|${l.period_id}`;
      if (!byRoom.has(kr)) byRoom.set(kr, []);
      byRoom.get(kr).push(l);
    }
  }

  for (const [k, group] of byTeacher) {
    if (group.length < 2) continue;
    const [teacherId, dayId, periodId] = k.split('|').map(Number);
    const t = teachers.get(teacherId) || {};
    const secs = [...new Set(group.map(g => label('s', g.section_id)))].join('، ');
    push({
      type: 'teacher_clash',
      title: TYPE_LABELS.teacher_clash,
      teacher_name: t.name,
      entity: t.name,
      section_name: secs,
      day_id: dayId,
      period_id: periodId,
      slot: slotLabel(dayId, periodId),
      reason: `المعلم مكلّف بأكثر من حصة في الوقت نفسه (${group.length} حصص: ${secs}).`,
      suggestion: 'انقل إحدى الحصص إلى خانة أخرى، أو غيّر المعلم في أحد الإسنادات.',
    });
  }

  for (const [k, group] of bySection) {
    if (group.length < 2) continue;
    const [sectionId, dayId, periodId] = k.split('|').map(Number);
    const subj = group.map(g => label('sub', g.subject_id)).join('، ');
    push({
      type: 'section_clash',
      title: TYPE_LABELS.section_clash,
      section_name: label('s', sectionId),
      entity: label('s', sectionId),
      day_id: dayId,
      period_id: periodId,
      slot: slotLabel(dayId, periodId),
      reason: `أكثر من حصة للشعبة نفسها في الوقت نفسه (${subj}).`,
      suggestion: 'احذف الحصة الزائدة أو انقلها إلى خانة فارغة.',
    });
  }

  for (const [k, group] of byRoom) {
    if (group.length < 2) continue;
    const [roomId, dayId, periodId] = k.split('|').map(Number);
    const secs = [...new Set(group.map(g => label('s', g.section_id)))].join('، ');
    push({
      type: 'room_clash',
      title: TYPE_LABELS.room_clash,
      room_name: label('r', roomId),
      entity: label('r', roomId),
      section_name: secs,
      day_id: dayId,
      period_id: periodId,
      slot: slotLabel(dayId, periodId),
      reason: `القاعة/المعمل محجوز لأكثر من شعبة (${secs}).`,
      suggestion: 'غيّر قاعة إحدى الحصص أو انقلها إلى وقت آخر.',
    });
  }

  // 2) الحصص غير الموزعة والإسنادات الناقصة
  const placedByAssignment = new Map();
  for (const l of lessons) {
    if (l.assignment_id) placedByAssignment.set(l.assignment_id, (placedByAssignment.get(l.assignment_id) || 0) + 1);
  }
  for (const a of assignments) {
    const placed = placedByAssignment.get(a.id) || 0;
    if (!a.teacher_id) {
      push({
        type: 'no_teacher',
        title: TYPE_LABELS.no_teacher,
        section_name: label('s', a.section_id),
        subject_name: label('sub', a.subject_id),
        entity: `${label('s', a.section_id)} — ${label('sub', a.subject_id)}`,
        reason: 'الإسناد لا يحتوي معلمًا، لذلك لا يمكن جدولته.',
        suggestion: 'اختر معلمًا مؤهلًا لهذا الإسناد من صفحة الشعب.',
        assignment_id: a.id,
      });
      continue;
    }
    if (placed < a.weekly_periods) {
      const missing = a.weekly_periods - placed;
      push({
        type: 'unplaced',
        title: TYPE_LABELS.unplaced,
        section_name: label('s', a.section_id),
        subject_name: label('sub', a.subject_id),
        teacher_name: label('t', a.teacher_id),
        entity: `${label('s', a.section_id)} — ${label('sub', a.subject_id)}`,
        reason: `المطلوب ${a.weekly_periods} حصة، وُزّعت ${placed}، والمتبقي ${missing}.`,
        suggestion: 'أعد التوليد بعد فحص نصاب المعلم والقاعات والأيام المتاحة أو حرّر القيود.',
        assignment_id: a.id,
        missing,
      });
    }
  }

  // 3) النصاب والحدود اليومية
  const teacherWeek = new Map();
  const teacherDay = new Map();
  const sectionDay = new Map();
  const subjectDay = new Map();
  const teacherDailyMax = new Map();
  const sectionDailyMax = new Map();
  for (const t of ctx.teachers || []) {
    teacherDailyMax.set(t.id, t.max_daily || 7);
  }
  for (const s of ctx.sections || []) sectionDailyMax.set(s.id, s.max_daily || school.max_daily_section || 7);
  const sectionSubjectMax = new Map();
  for (const s of ctx.subjects || []) sectionSubjectMax.set(s.id, s.max_per_day || 1);

  for (const l of lessons) {
    if (l.teacher_id) {
      teacherWeek.set(l.teacher_id, (teacherWeek.get(l.teacher_id) || 0) + 1);
      teacherDay.set(`${l.teacher_id}|${l.day_id}`, (teacherDay.get(`${l.teacher_id}|${l.day_id}`) || 0) + 1);
    }
    sectionDay.set(`${l.section_id}|${l.day_id}`, (sectionDay.get(`${l.section_id}|${l.day_id}`) || 0) + 1);
    subjectDay.set(`${l.section_id}|${l.subject_id}|${l.day_id}`, (subjectDay.get(`${l.section_id}|${l.subject_id}|${l.day_id}`) || 0) + 1);
  }

  for (const [tid, count] of teacherWeek) {
    const t = teachers.get(tid);
    if (!t) continue;
    if (t.weekly_load > 0 && count > t.weekly_load) {
      push({
        type: 'teacher_overload',
        title: TYPE_LABELS.teacher_overload,
        teacher_name: t.name,
        entity: t.name,
        reason: `المعلم مكلّف بـ ${count} حصة أسبوعيًا، ونصابه المحدد ${t.weekly_load}.`,
        suggestion: 'أنقص إسنادات المعلم أو ارفع نصابه من صفحة المعلمين.',
        severity: 'error',
      });
    }
  }

  for (const [k, count] of teacherDay) {
    const [tid, did] = k.split('|').map(Number);
    const max = teacherDailyMax.get(tid) || 7;
    if (count > max) {
      push({
        type: 'teacher_daily',
        title: TYPE_LABELS.teacher_daily,
        teacher_name: label('t', tid),
        entity: label('t', tid),
        day_id: did,
        period_id: null,
        slot: label('d', did),
        reason: `المعلم لديه ${count} حصص في اليوم، والحد ${max}.`,
        suggestion: 'وزّع حصصه على بقية الأيام أو ارفع الحد اليومي.',
      });
    }
  }

  for (const [k, count] of sectionDay) {
    const [sid, did] = k.split('|').map(Number);
    const max = sectionDailyMax.get(sid) || 7;
    if (count > max) {
      push({
        type: 'section_daily',
        title: TYPE_LABELS.section_daily,
        section_name: label('s', sid),
        entity: label('s', sid),
        day_id: did,
        slot: label('d', did),
        reason: `الشعبة لديها ${count} حصص في اليوم، والسقف ${max}.`,
        suggestion: 'قلّل حصص اليوم أو ارفع سقف الشعبة.',
      });
    }
  }

  for (const [k, count] of subjectDay) {
    const [sid, subId, did] = k.split('|').map(Number);
    const max = sectionSubjectMax.get(subId) || 1;
    if (count > max) {
      push({
        type: 'subject_repeat',
        title: TYPE_LABELS.subject_repeat,
        section_name: label('s', sid),
        subject_name: label('sub', subId),
        entity: label('sub', subId),
        day_id: did,
        slot: label('d', did),
        reason: `المادة مكرّرة ${count} مرات في اليوم، والحد ${max}.`,
        suggestion: 'انقل الحصة إلى يوم آخر أو ارفع حدّ المادة اليومي.',
        severity: 'warning',
      });
    }
  }

  // 4) التأهيل والتوافر والمعامل
  for (const l of lessons) {
    if (!l.teacher_id) continue;
    if (qualified.size && !qualified.has(`${l.teacher_id}|${l.subject_id}`)) {
      push({
        type: 'unqualified',
        title: TYPE_LABELS.unqualified,
        teacher_name: label('t', l.teacher_id),
        subject_name: label('sub', l.subject_id),
        section_name: label('s', l.section_id),
        entity: label('t', l.teacher_id),
        day_id: l.day_id,
        period_id: l.period_id,
        slot: slotLabel(l.day_id, l.period_id),
        reason: 'المعلم غير مرتبط بهذه المادة في بياناته.',
        suggestion: 'أضف المادة إلى مواد المعلم أو استبدله بمعلم مؤهل.',
        severity: 'warning',
      });
    }
    if (unavailable.has(`${l.teacher_id}|${l.day_id}|${l.period_id}`)) {
      push({
        type: 'unavailable',
        title: TYPE_LABELS.unavailable,
        teacher_name: label('t', l.teacher_id),
        section_name: label('s', l.section_id),
        entity: label('t', l.teacher_id),
        day_id: l.day_id,
        period_id: l.period_id,
        slot: slotLabel(l.day_id, l.period_id),
        reason: 'المعلم أعلن عدم توفره في هذا الوقت.',
        suggestion: 'انقل الحصة إلى وقت متاح للمعلم.',
      });
    }
    const subj = subjects.get(l.subject_id);
    if (subj && subj.needs_lab) {
      const room = rooms.get(l.room_id);
      if (!room || (room.kind !== 'lab' && room.kind !== 'computer')) {
        push({
          type: 'lab_missing',
          title: TYPE_LABELS.lab_missing,
          subject_name: subj.name,
          section_name: label('s', l.section_id),
          entity: subj.name,
          day_id: l.day_id,
          period_id: l.period_id,
          slot: slotLabel(l.day_id, l.period_id),
          reason: 'المادة تتطلب معملًا، والقاعة الحالية ليست معملًا.',
          suggestion: 'عيّن معملًا مناسبًا في الإسناد أو من محرّر الحصة.',
          severity: 'warning',
        });
      }
    }
  }

  // 5) التجاور: أكثر من حصتين متتاليتين لنفس المادة في الشعبة
  const orderedPeriods = (ctx.periods || []).filter(p => (p.kind || 'lesson') === 'lesson').sort((a, b) => a.idx - b.idx);
  const periodIndex = new Map(orderedPeriods.map((p, i) => [p.id, i]));
  for (const section of ctx.sections || []) {
    for (const day of ctx.days || []) {
      const row = lessons
        .filter(l => l.section_id === section.id && l.day_id === day.id && periodIndex.has(l.period_id))
        .sort((a, b) => periodIndex.get(a.period_id) - periodIndex.get(b.period_id));
      let run = 1;
      for (let i = 1; i < row.length; i++) {
        const prevIdx = periodIndex.get(row[i - 1].period_id);
        const curIdx = periodIndex.get(row[i].period_id);
        if (curIdx === prevIdx + 1 && row[i].subject_id === row[i - 1].subject_id) run++;
        else run = 1;
        if (run > (ctx.options && ctx.options.maxConsecutive || 2)) {
          push({
            type: 'consecutive',
            title: TYPE_LABELS.consecutive,
            subject_name: label('sub', row[i].subject_id),
            section_name: section.name,
            entity: section.name,
            day_id: day.id,
            period_id: row[i].period_id,
            slot: slotLabel(day.id, row[i].period_id),
            reason: `${run} حصص متتالية لنفس المادة.`,
            suggestion: 'انقل إحدى الحصص ليوم آخر أو إلى فترة غير متجاورة.',
            severity: 'warning',
          });
          break;
        }
      }
    }
  }

  conflicts.sort((a, b) => {
    const sev = (b.severity === 'error' ? 1 : 0) - (a.severity === 'error' ? 1 : 0);
    if (sev) return sev;
    return (a.day_id || 0) - (b.day_id || 0) || (a.period_id || 0) - (b.period_id || 0);
  });

  const byType = {};
  for (const c of conflicts) byType[c.type] = (byType[c.type] || 0) + 1;
  return {
    conflicts,
    errors: conflicts.filter(c => c.severity === 'error').length,
    warnings: conflicts.filter(c => c.severity === 'warning').length,
    byType,
    ok: conflicts.filter(c => c.severity === 'error').length === 0,
  };
}

/** فحص حصة واحدة قبل حفظها/نقلها. ignore يمكن أن يكون معرّفًا أو قائمة معرّفات. */
function validatePlacement(candidate, ctx, ignoreLessonId = null) {
  const ignore = new Set((Array.isArray(ignoreLessonId) ? ignoreLessonId : [ignoreLessonId]).filter(v => v != null));
  const lessons = (ctx.lessons || []).filter(l => !ignore.has(l.id));
  const room = ctx.rooms.find(r => r.id === candidate.room_id);
  const teacher = ctx.teachers.find(t => t.id === candidate.teacher_id);
  const subject = ctx.subjects.find(s => s.id === candidate.subject_id);
  const section = ctx.sections.find(s => s.id === candidate.section_id);
  const problems = [];

  for (const l of lessons) {
    if (l.day_id !== candidate.day_id || l.period_id !== candidate.period_id) continue;
    if (l.teacher_id === candidate.teacher_id) {
      problems.push(`المعلم ${teacher ? teacher.name : ''} لديه حصة مع الشعبة ${ctx.sections.find(s => s.id === l.section_id)?.name || ''} في هذا الوقت.`);
    }
    if (l.section_id === candidate.section_id) {
      problems.push('الشعبة لديها حصة أخرى في هذا الوقت.');
    }
    if (candidate.room_id && l.room_id === candidate.room_id) {
      problems.push(`القاعة ${room ? room.name : ''} مستخدمة في هذا الوقت.`);
    }
  }
  const t = teacher || {};
  const daily = lessons.filter(l => l.teacher_id === candidate.teacher_id && l.day_id === candidate.day_id).length;
  if (t.max_daily && daily + 1 > t.max_daily) problems.push(`سيتجاوز الحد اليومي للمعلم (${t.max_daily}).`);
  if (t.weekly_load) {
    const week = lessons.filter(l => l.teacher_id === candidate.teacher_id).length;
    if (week + 1 > t.weekly_load) problems.push(`سيتجاوز النصاب الأسبوعي للمعلم (${t.weekly_load}).`);
  }
  if (subject && subject.needs_lab && (!room || (room.kind !== 'lab' && room.kind !== 'computer'))) {
    problems.push('المادة تتطلب معملًا.');
  }
  const sameDay = lessons.filter(l => l.section_id === candidate.section_id && l.subject_id === candidate.subject_id && l.day_id === candidate.day_id).length;
  if (subject && subject.max_per_day && sameDay + 1 > subject.max_per_day) {
    problems.push(`المادة مسموح بها ${subject.max_per_day} حصة في اليوم فقط.`);
  }
  return { ok: problems.length === 0, problems, section: section?.name || '' };
}

export { detect, validatePlacement, TYPE_LABELS };
