import { activeCtx, activeSchedule, dayIdxForDate, enrich, fmtDate, nowIso, scheduleLessons, todayIso } from './model';
import { detect } from './conflicts';
import { qualityOf } from './scheduler.js';
import { examConflicts } from './exams';

const TYPE_LABEL: Record<string, string> = {
  holiday: 'إجازة رسمية', school_holiday: 'إجازة مدرسية', exam: 'اختبارات', event: 'فعالية', other: 'أخرى',
};

const CONF_LABEL: Record<string, string> = {
  error: 'خطأ', warning: 'تنبيه',
};

function buildGrid(lessons: any[], ctx: any, groups: any[]) {
  const days = ctx.days;
  const periods = ctx.periods.filter((p: any) => (p.kind || 'lesson') === 'lesson');
  return {
    days,
    periods,
    groups: groups.map((g) => {
      const cells: Record<string, any> = {};
      for (const l of lessons.filter(g.filter)) {
        cells[`${l.day_id}-${l.period_id}`] = {
          subject: l.subject_name,
          color: l.subject_color,
          teacher: l.teacher_name,
          section: l.section_name,
          room: l.room_name,
        };
      }
      return { title: g.title, subtitle: g.subtitle || '', cells };
    }),
  };
}

function flatLessons(lessons: any[]) {
  return lessons.slice().sort((a, b) => String(a.day_name).localeCompare(String(b.day_name), 'ar')
    || (a.period_idx || 0) - (b.period_idx || 0)).map((l) => ({
    day: l.day_name, period: l.period_name, grade: l.grade_name, section: l.section_name,
    subject: l.subject_name, teacher: l.teacher_name || '—', room: l.room_name || '—',
  }));
}

export function buildReport({ type, params, db }: { type: string; params?: any; db: any }) {
  const ctx = enrich(db);
  const school = ctx.school || {};
  const sch = activeSchedule(db);
  const allLessons = sch ? scheduleLessons(db, sch.id) : [];
  const base: any = {
    type,
    school,
    generatedAt: nowIso(),
    scheduleName: sch ? sch.name : 'لا يوجد جدول',
    columns: [],
    rows: [],
    summary: [],
  };
  const p = params || {};

  switch (type) {
    case 'school_schedule': {
      const groups = ctx.sections.map((s: any) => ({
        title: `${s.grade_name || ''} — شعبة ${s.name}`,
        filter: (l: any) => l.section_id === s.id,
      }));
      return {
        ...base,
        title: 'الجدول المدرسي العام',
        subtitle: sch ? `${sch.name} — ${school.academic_year || ''}` : 'لا يوجد جدول',
        grid: buildGrid(allLessons, ctx, groups),
        columns: [
          { key: 'day', label: 'اليوم', width: 12 }, { key: 'period', label: 'الحصة', width: 12 },
          { key: 'grade', label: 'الصف', width: 14 }, { key: 'section', label: 'الشعبة', width: 8 },
          { key: 'subject', label: 'المادة', width: 20 }, { key: 'teacher', label: 'المعلم', width: 22 },
          { key: 'room', label: 'القاعة', width: 14 },
        ],
        rows: flatLessons(allLessons),
        summary: [`عدد الحصص: ${allLessons.length}`, `الشعب: ${ctx.sections.length}`, `المعلمون: ${ctx.teachers.length}`],
        filename: 'الجدول-المدرسي-العام',
      };
    }
    case 'section_schedule': {
      const section = ctx.sections.find((s: any) => String(s.id) === String(p.sectionId)) || ctx.sections[0];
      if (!section) throw new Error('لا توجد شعب');
      const ls = allLessons.filter((l: any) => l.section_id === section.id);
      return {
        ...base,
        title: `جدول الشعبة ${section.name}`,
        subtitle: `${section.grade_name || ''} — ${school.academic_year || ''}`,
        grid: buildGrid(ls, ctx, [{ title: `${section.grade_name || ''} — شعبة ${section.name}`, filter: (l: any) => l.section_id === section.id }]),
        columns: [
          { key: 'day', label: 'اليوم' }, { key: 'period', label: 'الحصة' },
          { key: 'subject', label: 'المادة' }, { key: 'teacher', label: 'المعلم' }, { key: 'room', label: 'القاعة' },
        ],
        rows: flatLessons(ls).map((r) => ({ day: r.day, period: r.period, subject: r.subject, teacher: r.teacher, room: r.room })),
        summary: [`الحصص الموزعة: ${ls.length}`],
        filename: `جدول-الشعبة-${section.name}`,
      };
    }
    case 'teacher_schedule': {
      const teacher = ctx.teachers.find((t: any) => String(t.id) === String(p.teacherId)) || ctx.teachers[0];
      if (!teacher) throw new Error('لا يوجد معلمون');
      const ls = allLessons.filter((l: any) => l.teacher_id === teacher.id);
      return {
        ...base,
        title: `جدول المعلم ${teacher.name}`,
        subtitle: `${teacher.specialty || ''} — ${school.academic_year || ''}`,
        grid: buildGrid(ls, ctx, [{ title: teacher.name, subtitle: teacher.specialty, filter: (l: any) => l.teacher_id === teacher.id }]),
        columns: [
          { key: 'day', label: 'اليوم' }, { key: 'period', label: 'الحصة' },
          { key: 'grade', label: 'الصف' }, { key: 'section', label: 'الشعبة' },
          { key: 'subject', label: 'المادة' }, { key: 'room', label: 'القاعة' },
        ],
        rows: flatLessons(ls).map((r) => ({ day: r.day, period: r.period, grade: r.grade, section: r.section, subject: r.subject, room: r.room })),
        summary: [`الحصص: ${ls.length}`, `النصاب: ${teacher.weekly_load}`, `الحد اليومي: ${teacher.max_daily}`],
        filename: `جدول-المعلم-${teacher.name}`,
      };
    }
    case 'teachers_load': {
      const rows = ctx.teachers.map((t: any) => {
        const assigned = ctx.assignments.filter((a: any) => a.teacher_id === t.id).reduce((s: number, a: any) => s + a.weekly_periods, 0);
        return {
          name: t.name, specialty: t.specialty || '', load: t.weekly_load,
          assigned, diff: assigned - t.weekly_load, maxDaily: t.max_daily,
          assignedCount: ctx.assignments.filter((a: any) => a.teacher_id === t.id).length,
        };
      });
      return {
        ...base,
        title: 'تقرير نصاب المعلمين',
        subtitle: `${school.academic_year || ''}`,
        columns: [
          { key: 'name', label: 'المعلم', width: 24 }, { key: 'specialty', label: 'التخصص', width: 16 },
          { key: 'load', label: 'النصاب', width: 10 }, { key: 'assigned', label: 'المُسند', width: 10 },
          { key: 'diff', label: 'الفرق', width: 10 }, { key: 'maxDaily', label: 'الحد اليومي', width: 12 },
          { key: 'assignedCount', label: 'عدد الإسنادات', width: 12 },
        ],
        rows,
        summary: [`المعلمون: ${rows.length}`, `إجمالي المُسند: ${rows.reduce((s: number, r: any) => s + r.assigned, 0)}`],
        filename: 'تقرير-نصاب-المعلمين',
      };
    }
    case 'absence': {
      const from = p.from || '0000-01-01';
      const to = p.to || '9999-12-31';
      const rows = db.absences
        .filter((a: any) => a.date >= from && a.date <= to)
        .map((a: any) => {
          const covers = db.covers.filter((c: any) => c.absence_id === a.id);
          return {
            ...a,
            teacher_name: db.teachers.find((t: any) => t.id === a.teacher_id)?.name || '',
            covers: covers.length,
            filled: covers.filter((c: any) => c.status === 'assigned').length,
          };
        })
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
      return {
        ...base,
        title: 'تقرير الغياب',
        subtitle: `من ${fmtDate(p.from) || 'البداية'} إلى ${fmtDate(p.to) || 'اليوم'}`,
        columns: [
          { key: 'date', label: 'التاريخ' }, { key: 'teacher_name', label: 'المعلم' },
          { key: 'reason', label: 'السبب' }, { key: 'covers', label: 'حصص متأثرة' }, { key: 'filled', label: 'مغطاة' },
        ],
        rows: rows.map((r: any) => ({ ...r, date: fmtDate(r.date) })),
        summary: [`سجلات الغياب: ${rows.length}`, `الحصص المغطاة: ${rows.reduce((s: number, r: any) => s + (r.filled || 0), 0)}`],
        filename: 'تقرير-الغياب',
      };
    }
    case 'covers': {
      const date = p.date || new Date().toISOString().slice(0, 10);
      const rows = db.covers.filter((c: any) => c.date === date).map((c: any) => ({
        ...c,
        substitute_name: db.teachers.find((t: any) => t.id === c.substitute_id)?.name || 'غير مغطاة',
        absent_teacher_name: db.teachers.find((t: any) => t.id === c.absent_teacher_id)?.name || '',
        section_name: db.sections.find((s: any) => s.id === c.section_id)?.name || '',
        subject_name: db.subjects.find((s: any) => s.id === c.subject_id)?.name || '',
        period_name: db.periods.find((p2: any) => p2.id === c.period_id)?.name || '',
        period_idx: db.periods.find((p2: any) => p2.id === c.period_id)?.idx || 0,
        statusLabel: c.status === 'assigned' ? 'مكلفة' : 'ناقصة',
      })).sort((a: any, b: any) => a.period_idx - b.period_idx);
      return {
        ...base,
        title: 'تقرير حصص الانتظار',
        subtitle: `تاريخ ${fmtDate(date)}`,
        columns: [
          { key: 'period_name', label: 'الحصة' }, { key: 'section_name', label: 'الشعبة' },
          { key: 'subject_name', label: 'المادة' }, { key: 'absent_teacher_name', label: 'المعلم الغائب' },
          { key: 'substitute_name', label: 'البديل' }, { key: 'statusLabel', label: 'الحالة' },
        ],
        rows,
        summary: [`إجمالي: ${rows.length}`, `مغطاة: ${rows.filter((r: any) => r.status === 'assigned').length}`],
        filename: `تقرير-الانتظار-${date}`,
      };
    }
    case 'duties': {
      const areas = db.supervision_areas.filter((a: any) => a.active !== 0);
      const days = ctx.days;
      let periods = ctx.periods;
      try {
        const ids = JSON.parse(db.settings.duty_periods || 'null');
        if (Array.isArray(ids) && ids.length) periods = periods.filter((x: any) => ids.includes(x.id));
      } catch { /* ignore */ }
      const duties = db.duties.map((d: any) => ({
        ...d,
        teacher_name: db.teachers.find((t: any) => t.id === d.teacher_id)?.name || '',
        area_name: db.supervision_areas.find((a: any) => a.id === d.area_id)?.name || '',
        period_name: db.periods.find((p2: any) => p2.id === d.period_id)?.name || '',
      }));
      const groups = areas.map((area: any) => {
        const cells: Record<string, any> = {};
        for (const d of duties.filter((x: any) => x.area_id === area.id)) {
          cells[`${d.day_id}-${d.period_id}`] = {
            subject: d.teacher_name || 'شاغر',
            color: d.teacher_name ? '#0d9488' : '#ef4444', teacher: '', section: '', room: '',
          };
        }
        return { title: area.name, subtitle: '', cells };
      });
      return {
        ...base,
        title: 'جدول الإشراف والمناوبة',
        subtitle: `${school.academic_year || ''}`,
        grid: { days, periods, groups },
        columns: [
          { key: 'area_name', label: 'الموقع' }, { key: 'day_name', label: 'اليوم' },
          { key: 'period_name', label: 'الفترة' }, { key: 'teacher_name', label: 'المعلم' }, { key: 'statusLabel', label: 'الحالة' },
        ],
        rows: duties.map((d: any) => ({
          ...d,
          day_name: db.days.find((x: any) => x.id === d.day_id)?.name || '',
          teacher_name: d.teacher_name || 'شاغر',
          statusLabel: d.status === 'done' ? 'منفذة' : d.status === 'absent' ? 'غياب' : 'مخططة',
        })),
        summary: [`المناوبات: ${duties.length}`, `شاغرة: ${duties.filter((d: any) => !d.teacher_id).length}`],
        filename: 'جدول-الإشراف-والمناوبة',
      };
    }
    case 'conflicts': {
      const conf = detect({ ...ctx, lessons: allLessons, school: ctx.school });
      return {
        ...base,
        title: 'تقرير التعارضات',
        subtitle: sch ? sch.name : '',
        columns: [
          { key: 'title', label: 'النوع' }, { key: 'severityLabel', label: 'الخطورة' },
          { key: 'entity', label: 'المتأثر' }, { key: 'slot', label: 'الوقت' },
          { key: 'reason', label: 'السبب' }, { key: 'suggestion', label: 'المقترح' },
        ],
        rows: conf.conflicts.map((c: any) => ({ ...c, severityLabel: CONF_LABEL[c.severity] || c.severity })),
        summary: [`الأخطاء: ${conf.errors}`, `التنبيهات: ${conf.warnings}`],
        filename: 'تقرير-التعارضات',
      };
    }
    case 'unplaced': {
      const conf = detect({ ...ctx, lessons: allLessons, school: ctx.school });
      const rows = conf.conflicts.filter((c: any) => c.type === 'unplaced' || c.type === 'no_teacher').map((c: any) => ({
        section: c.section_name, subject: c.subject_name, teacher: c.teacher_name || '—', reason: c.reason,
      }));
      return {
        ...base,
        title: 'تقرير الحصص غير الموزعة',
        subtitle: sch ? sch.name : '',
        columns: [
          { key: 'section', label: 'الشعبة' }, { key: 'subject', label: 'المادة' },
          { key: 'teacher', label: 'المعلم' }, { key: 'reason', label: 'التفصيل' },
        ],
        rows,
        summary: [`غير موزعة: ${rows.length}`],
        filename: 'تقرير-الحصص-غير-الموزعة',
      };
    }
    case 'subjects': {
      const rows = ctx.subjects.map((s: any) => ({
        name: s.name, stage: s.stage, weekly: s.weekly_periods, maxPerDay: s.max_per_day,
        lab: s.needs_lab ? 'نعم' : 'لا',
        sections: ctx.assignments.filter((a: any) => a.subject_id === s.id).length,
      }));
      return {
        ...base,
        title: 'تقرير المواد الدراسية',
        columns: [
          { key: 'name', label: 'المادة' }, { key: 'stage', label: 'المرحلة' },
          { key: 'weekly', label: 'حصص أسبوعية' }, { key: 'maxPerDay', label: 'حد التكرار اليومي' },
          { key: 'lab', label: 'معمل' }, { key: 'sections', label: 'عدد الشعب' },
        ],
        rows,
        summary: [`المواد: ${rows.length}`],
        filename: 'تقرير-المواد',
      };
    }
    case 'today_schedule': {
      const date = p.date || todayIso();
      const idx = dayIdxForDate(date);
      const day = ctx.days.find((d: any) => d.idx === idx);
      const ls = day ? allLessons.filter((l: any) => l.day_id === day.id) : [];
      const groups = ctx.sections.map((s: any) => ({
        title: `${s.grade_name || ''} — شعبة ${s.name}`,
        filter: (l: any) => l.section_id === s.id,
      }));
      return {
        ...base,
        title: 'جدول اليوم',
        subtitle: `${day ? day.name : 'يوم غير دراسي'} — ${fmtDate(date)}`,
        grid: buildGrid(ls, ctx, groups),
        columns: [
          { key: 'day', label: 'اليوم' }, { key: 'period', label: 'الحصة' },
          { key: 'grade', label: 'الصف' }, { key: 'section', label: 'الشعبة' },
          { key: 'subject', label: 'المادة' }, { key: 'teacher', label: 'المعلم' }, { key: 'room', label: 'القاعة' },
        ],
        rows: flatLessons(ls),
        summary: [`الحصص: ${ls.length}`, `الشعب: ${new Set(ls.map((l: any) => l.section_id)).size}`],
        filename: `جدول-اليوم-${date}`,
      };
    }
    case 'teacher_day': {
      const date = p.date || todayIso();
      const idx = dayIdxForDate(date);
      const day = ctx.days.find((d: any) => d.idx === idx);
      const teacher = ctx.teachers.find((t: any) => String(t.id) === String(p.teacherId)) || ctx.teachers[0];
      if (!teacher) throw new Error('لا يوجد معلمون');
      const ls = day ? allLessons.filter((l: any) => l.teacher_id === teacher.id && l.day_id === day.id) : [];
      return {
        ...base,
        title: `دوام المعلم ${teacher.name}`,
        subtitle: `${day ? day.name : 'يوم غير دراسي'} — ${fmtDate(date)}`,
        grid: buildGrid(ls, ctx, [{ title: teacher.name, subtitle: teacher.specialty, filter: (l: any) => l.teacher_id === teacher.id }]),
        columns: [
          { key: 'period', label: 'الحصة' }, { key: 'grade', label: 'الصف' }, { key: 'section', label: 'الشعبة' },
          { key: 'subject', label: 'المادة' }, { key: 'room', label: 'القاعة' },
        ],
        rows: ls.map((l: any) => ({ period: l.period_name, grade: l.grade_name, section: l.section_name, subject: l.subject_name, room: l.room_name || '—' })),
        summary: [`حصص اليوم: ${ls.length}`, `النصاب: ${teacher.weekly_load}`],
        filename: `دوام-المعلم-${teacher.name}-${date}`,
      };
    }
    case 'exams': {
      const exams = db.exams || [];
      const grades = new Map<number, string>(db.grades.map((g: any) => [g.id, g.name]));
      const sections = new Map<number, any>(db.sections.map((s: any) => [s.id, s]));
      const subjects = new Map<number, string>(db.subjects.map((s: any) => [s.id, s.name]));
      const teachers = new Map<number, string>(db.teachers.map((t: any) => [t.id, t.name]));
      const rooms = new Map<number, string>(db.rooms.map((r: any) => [r.id, r.name]));
      const days = new Map<number, any>(db.days.map((d: any) => [d.id, d]));
      const periods = new Map<number, any>(db.periods.map((x: any) => [x.id, x]));
      const filtered = exams.filter((e: any) => !p.gradeId || Number(e.grade_id) === Number(p.gradeId)
        || Number(sections.get(Number(e.section_id))?.grade_id) === Number(p.gradeId));
      const examConflict = examConflicts(db, exams);
      const rows = filtered.map((e: any) => {
        const sec: any = sections.get(Number(e.section_id));
        return {
          day: days.get(e.day_id)?.name || '', period: periods.get(e.period_id)?.name || '',
          grade: grades.get(Number(sec?.grade_id)) || '', section: sec?.name || '',
          subject: subjects.get(e.subject_id) || '', room: rooms.get(Number(e.room_id)) || '',
          invigilator: teachers.get(Number(e.invigilator_id)) || '—',
          duration: e.duration || 60, notes: e.notes || '',
          sortDay: days.get(e.day_id)?.idx || 0, sortPeriod: periods.get(e.period_id)?.idx || 0,
        };
      }).sort((a: any, b: any) => a.sortDay - b.sortDay || a.sortPeriod - b.sortPeriod
        || String(a.grade).localeCompare(String(b.grade), 'ar') || String(a.section).localeCompare(String(b.section), 'ar'));
      return {
        ...base,
        title: 'جدول الاختبارات',
        subtitle: `${school.academic_year || ''} — ${examConflict.errors ? `${examConflict.errors} تعارضًا` : 'لا تعارضات'}`,
        columns: [
          { key: 'day', label: 'اليوم' }, { key: 'period', label: 'الحصة' },
          { key: 'grade', label: 'الصف' }, { key: 'section', label: 'الشعبة' },
          { key: 'subject', label: 'المادة' }, { key: 'room', label: 'القاعة' },
          { key: 'invigilator', label: 'المراقب' }, { key: 'duration', label: 'المدة' },
        ],
        rows,
        summary: [`الاختبارات: ${filtered.length}`, `تعارضات: ${examConflict.errors}`, `تنبيهات: ${examConflict.warnings}`],
        filename: 'جدول-الاختبارات',
      };
    }
    case 'readiness': {
      const conf = detect({ ...ctx, lessons: allLessons, school: ctx.school });
      const examConflict = examConflicts(db, db.exams || []);
      const noTeacher = ctx.assignments.filter((a: any) => !a.teacher_id).length;
      const over = ctx.assignments.reduce((map: Map<number, number>, a: any) => {
        if (a.teacher_id) map.set(a.teacher_id, (map.get(a.teacher_id) || 0) + Number(a.weekly_periods || 0));
        return map;
      }, new Map());
      const overloaded = ctx.teachers.filter((t: any) => (over.get(t.id) || 0) > t.weekly_load).length;
      const checks = [
        { check: 'الجدول الدراسي', status: sch ? (conf.errors ? 'تحذير' : 'جاهز') : 'ناقص', detail: sch ? `${conf.errors} تعارضًا` : 'لم يُولّد بعد' },
        { check: 'إسناد المعلمين', status: noTeacher ? 'ناقص' : 'جاهز', detail: `${noTeacher} إسنادًا بلا معلم` },
        { check: 'الأنصبة', status: overloaded ? 'تحذير' : 'جاهز', detail: `${overloaded} معلمًا فوق النصاب` },
        { check: 'جدول الاختبارات', status: (db.exams || []).length ? (examConflict.errors ? 'تحذير' : 'جاهز') : 'ناقص', detail: `${(db.exams || []).length} اختبارًا · ${examConflict.errors} تعارضًا` },
        { check: 'المناوبات', status: db.duties.length ? (db.duties.some((d: any) => !d.teacher_id) ? 'تحذير' : 'جاهز') : 'ناقص', detail: `${db.duties.filter((d: any) => !d.teacher_id).length} شاغرة` },
        { check: 'النسخ الاحتياطي', status: db.settings.last_backup ? 'جاهز' : 'تحذير', detail: db.settings.last_backup ? `آخر نسخة: ${fmtDate(db.settings.last_backup.slice(0, 10))}` : 'لم تُنشأ نسخة مشفّرة/احتياطية بعد' },
      ];
      return {
        ...base,
        title: 'تقرير جاهزية المدرسة',
        subtitle: `${fmtDate(todayIso())}`,
        columns: [{ key: 'check', label: 'الفحص' }, { key: 'status', label: 'الحالة' }, { key: 'detail', label: 'التفصيل' }],
        rows: checks,
        summary: [`جاهز: ${checks.filter((c) => c.status === 'جاهز').length}/${checks.length}`],
        filename: 'تقرير-جاهزية-المدرسة',
      };
    }
    case 'quality': {
      const periodIdx = new Map(ctx.periods.map((p: any, i: number) => [p.id, i]));
      const quality = qualityOf(allLessons, { ...ctx, periodOrder: periodIdx });
      const byTeacherDay = new Map<string, number[]>();
      for (const l of allLessons) {
        if (!l.teacher_id) continue;
        const k = `${l.teacher_id}|${l.day_id}`;
        if (!byTeacherDay.has(k)) byTeacherDay.set(k, []);
        byTeacherDay.get(k)!.push(Number(periodIdx.get(l.period_id) || 0));
      }
      const gapsOf = (arr: number[]) => {
        const idxs = arr.slice().sort((a, b) => a - b);
        let g = 0;
        for (let i = 1; i < idxs.length; i++) g += Math.max(0, idxs[i] - idxs[i - 1] - 1);
        return g;
      };
      const rows = ctx.teachers.map((t: any) => {
        const mine = allLessons.filter((l: any) => l.teacher_id === t.id);
        const planned = ctx.assignments.filter((a: any) => a.teacher_id === t.id)
          .reduce((sum: number, a: any) => sum + Number(a.weekly_periods || 0), 0);
        const daysUsed = new Set(mine.map((l: any) => l.day_id)).size;
        const perDay = [...byTeacherDay.entries()].filter(([k]) => k.startsWith(`${t.id}|`)).map(([, v]) => v);
        const gaps = perDay.reduce((sum, arr) => sum + gapsOf(arr), 0);
        const busiest = perDay.reduce((m, arr) => Math.max(m, arr.length), 0);
        return {
          name: t.name, specialty: t.specialty || '', planned, placed: mine.length,
          diff: mine.length - planned, daysUsed, perDay: daysUsed ? (mine.length / daysUsed).toFixed(1) : '0',
          busiest, gaps, maxDaily: t.max_daily,
        };
      }).sort((a: any, b: any) => b.gaps - a.gaps);
      return {
        ...base,
        title: 'تقرير جودة الجدول',
        subtitle: `${sch ? sch.name : ''} — ${school.academic_year || ''}`,
        quality,
        columns: [
          { key: 'name', label: 'المعلم', width: 22 }, { key: 'specialty', label: 'التخصص', width: 14 },
          { key: 'planned', label: 'المطلوب', width: 9 }, { key: 'placed', label: 'الموزع', width: 9 },
          { key: 'diff', label: 'الفرق', width: 8 }, { key: 'daysUsed', label: 'أيام', width: 7 },
          { key: 'perDay', label: 'متوسط/يوم', width: 10 }, { key: 'busiest', label: 'أكثر يوم', width: 9 },
          { key: 'gaps', label: 'فراغات', width: 8 }, { key: 'maxDaily', label: 'الحد اليومي', width: 10 },
        ],
        rows,
        summary: [
          `الجودة: ${quality.score}/100 (${quality.grade})`,
          `التغطية: ${quality.coverage}%`,
          `فراغات المعلمين: ${quality.teacherGaps}`,
          `انتشار المواد: ${quality.spreadRatio}%`,
          `عدالة الأنصبة: ${quality.fairness}%`,
        ],
        filename: 'تقرير-جودة-الجدول',
      };
    }
    case 'rooms': {
      const rows = ctx.rooms.map((r: any) => {
        const count = allLessons.filter((l: any) => l.room_id === r.id).length;
        return { name: r.name, kind: r.kind, capacity: r.capacity, count, usage: `${Math.round((count / Math.max(1, ctx.days.length * 7)) * 100)}%` };
      });
      return {
        ...base,
        title: 'تقرير استخدام القاعات',
        columns: [
          { key: 'name', label: 'القاعة' }, { key: 'kind', label: 'النوع' },
          { key: 'capacity', label: 'السعة' }, { key: 'count', label: 'حصص' }, { key: 'usage', label: 'نسبة الاستخدام' },
        ],
        rows,
        summary: [`القاعات: ${rows.length}`],
        filename: 'تقرير-القاعات',
      };
    }
    case 'calendar': {
      const rows = db.calendar_events.slice().sort((a: any, b: any) => String(a.start_date).localeCompare(String(b.start_date))).map((e: any) => ({
        title: e.title, type: TYPE_LABEL[e.type] || e.type, start: fmtDate(e.start_date), end: fmtDate(e.end_date), note: e.note || '',
      }));
      return {
        ...base,
        title: 'التقويم الدراسي',
        columns: [
          { key: 'title', label: 'الحدث' }, { key: 'type', label: 'النوع' },
          { key: 'start', label: 'من' }, { key: 'end', label: 'إلى' }, { key: 'note', label: 'ملاحظات' },
        ],
        rows,
        summary: [`الأحداث: ${rows.length}`],
        filename: 'التقويم-الدراسي',
      };
    }
    default:
      throw new Error('نوع التقرير غير معروف');
  }
}

export function catalog() {
  return [
    { type: 'school_schedule', title: 'الجدول المدرسي العام', icon: 'grid' },
    { type: 'section_schedule', title: 'جدول شعبة', icon: 'layers', needs: 'section' },
    { type: 'teacher_schedule', title: 'جدول معلم', icon: 'user', needs: 'teacher' },
    { type: 'teachers_load', title: 'نصاب المعلمين', icon: 'chart' },
    { type: 'covers', title: 'حصص الانتظار', icon: 'swap', needs: 'date' },
    { type: 'absence', title: 'سجل الغياب', icon: 'calendar', needs: 'range' },
    { type: 'duties', title: 'الإشراف والمناوبة', icon: 'shield' },
    { type: 'today_schedule', title: 'جدول اليوم', icon: 'calendar', needs: 'date' },
    { type: 'teacher_day', title: 'دوام معلم اليوم', icon: 'user', needs: 'teacher_date' },
    { type: 'exams', title: 'جدول الاختبارات', icon: 'exam' },
    { type: 'readiness', title: 'جاهزية المدرسة', icon: 'check' },
    { type: 'quality', title: 'جودة الجدول', icon: 'gauge' },
    { type: 'conflicts', title: 'التعارضات', icon: 'alert' },
    { type: 'unplaced', title: 'الحصص غير الموزعة', icon: 'clock' },
    { type: 'subjects', title: 'المواد الدراسية', icon: 'book' },
    { type: 'rooms', label: 'استخدام القاعات', title: 'استخدام القاعات', icon: 'door' },
    { type: 'calendar', title: 'التقويم الدراسي', icon: 'flag' },
  ];
}

export function reportCsv(report: any): string {
  const cols = report.columns || [];
  const lines = [cols.map((c: any) => c.label).join(',')];
  for (const row of report.rows || []) {
    lines.push(cols.map((c: any) => {
      const v = row[c.key] ?? '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    }).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
