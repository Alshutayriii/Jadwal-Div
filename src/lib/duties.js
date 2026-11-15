'use strict';
/**
 * توزيع الإشراف والمناوبة بعدالة، مع منع التعارض مع الحصص.
 * يعمل على بيانات جاهزة ليمكن اختباره.
 */

function generateDuties(input) {
  const {
    areas = [],
    days = [],
    periods = [],
    teachers = [],
    lessons = [],
    existing = [],
    options = {},
  } = input;

  const avoidConsecutiveDays = options.avoidConsecutiveDays !== false;
  const maxPerDay = options.maxPerDay || 2;

  const activeTeachers = teachers.filter(t => t.active !== 0).slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const teaching = new Set();
  for (const l of lessons) {
    if (l.teacher_id) teaching.add(`${l.teacher_id}|${l.day_id}|${l.period_id}`);
  }

  const slots = [];
  for (const day of days) {
    for (const period of periods) {
      for (const area of areas) {
        slots.push({ day, period, area });
      }
    }
  }

  const count = new Map();
  const dayCount = new Map();
  const lastDayIndex = new Map();
  const usedSlot = new Set();
  const usedAreaSlot = new Set();
  const result = [];

  for (const e of existing) {
    if (!e.teacher_id) continue;
    count.set(e.teacher_id, (count.get(e.teacher_id) || 0) + 1);
    dayCount.set(`${e.teacher_id}|${e.day_id}`, (dayCount.get(`${e.teacher_id}|${e.day_id}`) || 0) + 1);
    lastDayIndex.set(e.teacher_id, Math.max(lastDayIndex.get(e.teacher_id) || -1, e.day_id));
    usedSlot.add(`${e.teacher_id}|${e.day_id}|${e.period_id}`);
    usedAreaSlot.add(`${e.area_id}|${e.day_id}|${e.period_id}`);
  }

  const orderedDays = days.slice().sort((a, b) => a.idx - b.idx);
  const orderedPeriods = periods.slice().sort((a, b) => a.idx - b.idx);

  for (const day of orderedDays) {
    for (const period of orderedPeriods) {
      for (const area of areas) {
        if (usedAreaSlot.has(`${area.id}|${day.id}|${period.id}`)) continue;
        let best = null;
        let bestScore = Infinity;
        for (const t of activeTeachers) {
          if (teaching.has(`${t.id}|${day.id}|${period.id}`)) continue;
          if (usedSlot.has(`${t.id}|${day.id}|${period.id}`)) continue;
          if ((dayCount.get(`${t.id}|${day.id}`) || 0) >= maxPerDay) continue;
          let score = (count.get(t.id) || 0) * 10;
          score += (dayCount.get(`${t.id}|${day.id}`) || 0) * 4;
          if (avoidConsecutiveDays) {
            const last = lastDayIndex.get(t.id);
            if (last !== undefined && Math.abs(last - day.idx) === 1) score += 3;
          }
          if (bestScore > score) { bestScore = score; best = t; }
        }
        if (!best) {
          result.push({
            area_id: area.id,
            day_id: day.id,
            period_id: period.id,
            teacher_id: null,
            status: 'vacant',
            note: 'لا يوجد معلم متاح في هذه الفترة',
          });
          continue;
        }
        usedSlot.add(`${best.id}|${day.id}|${period.id}`);
        count.set(best.id, (count.get(best.id) || 0) + 1);
        dayCount.set(`${best.id}|${day.id}`, (dayCount.get(`${best.id}|${day.id}`) || 0) + 1);
        lastDayIndex.set(best.id, day.idx);
        result.push({
          area_id: area.id,
          day_id: day.id,
          period_id: period.id,
          teacher_id: best.id,
          status: 'planned',
          note: '',
        });
      }
    }
  }

  // تحقق: هل توجد مناوبة تعارض حصة؟
  const clashes = result.filter(d => d.teacher_id && teaching.has(`${d.teacher_id}|${d.day_id}|${d.period_id}`));
  return {
    duties: result,
    clashes: clashes.length,
    vacant: result.filter(d => !d.teacher_id).length,
    fairness: [...count.entries()].map(([teacher_id, n]) => ({ teacher_id, count: n }))
      .sort((a, b) => b.count - a.count),
  };
}

export { generateDuties };
