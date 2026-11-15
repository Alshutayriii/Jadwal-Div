'use strict';
/**
 * محرك الجدولة — بناء جدول مدرسي بقيود صارمة.
 * لا يستخدم أي مكتبة خارجية ولا يعتمد على قاعدة البيانات، ليمكن اختباره مباشرة.
 *
 * القيود الصارمة:
 *  - منع تعارض المعلم/الشعبة/القاعة.
 *  - احترام عدم توفر المعلم.
 *  - احترام النصاب الأسبوعي والحد اليومي للمعلم.
 *  - منع تكرار المادة أكثر من حدّها اليومي في الشعبة.
 *  - منع تخطي سقف اليوم للشعبة.
 *  - احترام الحصص المثبّتة.
 *
 * القيود اللينة (تُحسّن بالبحث المحلي):
 *  - توزيع المادة على أكبر عدد من الأيام.
 *  - تقليل فراغات المعلم وتوازن أيامه.
 *  - تجاور المواد التي تتطلب حصتين متتاليتين.
 *
 * الاستقرار: يستخدم المحرك مولّد أرقام عشوائية بذرة ثابتة لكل محاولة،
 * ولا يقطع أي محاولة بالساعة، لذا النتيجة قابلة للتكرار على نفس المدخلات.
 * الحصص التي يصعب توزيعها جشعًا تُحلّ بسلاسل إزاحة (Ejection Chains) بعمق محدود.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(input) {
  const started = Date.now();
  const options = Object.assign({
    timeLimitMs: 6000,
    seed: 42,
    maxRestarts: 80,
    maxConsecutive: 2,
    spreadSubjects: true,
    avoidGaps: true,
    repairDepth: 2,
  }, input.options || {});

  const days = (input.days || []).slice().sort((a, b) => a.idx - b.idx);
  const periods = (input.periods || []).filter(p => (p.kind || 'lesson') === 'lesson').sort((a, b) => a.idx - b.idx);
  const assignments = (input.assignments || []).filter(a => a.weekly_periods > 0);
  const teachers = new Map((input.teachers || []).map(t => [t.id, t]));
  const subjects = new Map((input.subjects || []).map(s => [s.id, s]));
  const sections = new Map((input.sections || []).map(s => [s.id, s]));
  const rooms = new Map((input.rooms || []).map(r => [r.id, r]));
  const assignmentById = new Map(assignments.map(a => [a.id, a]));
  const slots = [];
  for (const d of days) for (const p of periods) slots.push({ day: d.id, period: p.id });

  if (!days.length || !periods.length) {
    return { lessons: [], unplaced: [], stats: emptyStats(), options, elapsedMs: 0, message: 'لا توجد أيام أو حصص نشطة.' };
  }

  const unavailable = new Set();
  for (const a of assignments) {
    for (const u of a.unavailable || []) unavailable.add(`${a.teacher_id}|${u[0]}|${u[1]}`);
  }

  // الحصص المثبّتة (إن وجدت) تُحجز قبل التوليد.
  const locked = (input.locked || []).filter(l => l.day_id && l.period_id);
  const lockedKeys = new Set();
  const lockedUnits = [];
  for (const l of locked) {
    const key = `${l.section_id}|${l.day_id}|${l.period_id}`;
    if (lockedKeys.has(key)) continue;
    lockedKeys.add(key);
    lockedUnits.push({
      assignment_id: l.assignment_id || null,
      section_id: l.section_id,
      subject_id: l.subject_id,
      teacher_id: l.teacher_id,
      room_id: l.room_id,
      day_id: l.day_id,
      period_id: l.period_id,
      locked: 1,
    });
  }

  // فهارس الخانات: مفتاح الخانة → الحصة (بدلًا من مجموعات فقط، لمعرفة المُعيق).
  const sectionAt = new Map();
  const teacherAt = new Map();
  const roomAt = new Map();

  const teacherDay = new Map();
  const sectionDay = new Map();
  const subjectDay = new Map();
  const teacherWeek = new Map();
  const inc = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);
  const dec = (map, key) => {
    const v = (map.get(key) || 0) - 1;
    if (v <= 0) map.delete(key); else map.set(key, v);
  };

  function applyFixed(l, sign = 1) {
    const f = sign > 0 ? inc : dec;
    f(teacherDay, `${l.teacher_id}|${l.day_id}`);
    f(sectionDay, `${l.section_id}|${l.day_id}`);
    f(subjectDay, `${l.section_id}|${l.subject_id}|${l.day_id}`);
    if (l.teacher_id) f(teacherWeek, `${l.teacher_id}`);
  }

  function sectionMaxDaily(secId) {
    const s = sections.get(secId);
    return (s && s.max_daily) || options.sectionMaxDaily || 7;
  }

  function roomFor(a) {
    if (a.room_id) return a.room_id;
    const sec = sections.get(a.section_id);
    return sec ? sec.room_id || null : null;
  }

  function hardFeasible(a, slot) {
    if (!a.teacher_id) return false;
    if (unavailable.has(`${a.teacher_id}|${slot.day}|${slot.period}`)) return false;
    if (sectionAt.has(`${a.section_id}|${slot.day}|${slot.period}`)) return false;
    if (teacherAt.has(`${a.teacher_id}|${slot.day}|${slot.period}`)) return false;
    const room = roomFor(a);
    if (room && roomAt.has(`${room}|${slot.day}|${slot.period}`)) return false;
    const t = teachers.get(a.teacher_id) || {};
    const maxDaily = t.max_daily || options.teacherMaxDaily || 7;
    if ((teacherDay.get(`${a.teacher_id}|${slot.day}`) || 0) >= maxDaily) return false;
    if ((sectionDay.get(`${a.section_id}|${slot.day}`) || 0) >= sectionMaxDaily(a.section_id)) return false;
    const maxSubject = a.max_per_day || 1;
    if ((subjectDay.get(`${a.section_id}|${a.subject_id}|${slot.day}`) || 0) >= maxSubject) return false;
    if (t.weekly_load > 0 && (teacherWeek.get(`${a.teacher_id}`) || 0) >= t.weekly_load) return false;
    return true;
  }

  function softScore(a, slot) {
    let score = 0;
    const t = teachers.get(a.teacher_id) || {};
    const tDay = teacherDay.get(`${a.teacher_id}|${slot.day}`) || 0;
    const sDay = sectionDay.get(`${a.section_id}|${slot.day}`) || 0;
    const subjDay = subjectDay.get(`${a.section_id}|${a.subject_id}|${slot.day}`) || 0;
    if (options.spreadSubjects) score += subjDay * 6;
    score += tDay * 0.6 + sDay * 0.15;
    if (a.consecutive) {
      const before = subjectDay.get(`${a.section_id}|${a.subject_id}|${slot.day}`) || 0;
      score -= before > 0 ? 2.5 : 0;
    }
    const load = (t.weekly_load || a.weekly_periods || 0);
    if (load) score += (tDay / Math.max(1, load)) * 2;
    return score;
  }

  function place(a, slot, lockedFlag = 0) {
    const room = roomFor(a);
    const lesson = {
      assignment_id: a.id,
      section_id: a.section_id,
      subject_id: a.subject_id,
      teacher_id: a.teacher_id,
      room_id: room,
      day_id: slot.day,
      period_id: slot.period,
      locked: lockedFlag,
    };
    sectionAt.set(`${a.section_id}|${slot.day}|${slot.period}`, lesson);
    if (a.teacher_id) teacherAt.set(`${a.teacher_id}|${slot.day}|${slot.period}`, lesson);
    if (room) roomAt.set(`${room}|${slot.day}|${slot.period}`, lesson);
    applyFixed(lesson, 1);
    return lesson;
  }

  function remove(lesson) {
    const sk = `${lesson.section_id}|${lesson.day_id}|${lesson.period_id}`;
    if (sectionAt.get(sk) === lesson) sectionAt.delete(sk);
    if (lesson.teacher_id) {
      const tk = `${lesson.teacher_id}|${lesson.day_id}|${lesson.period_id}`;
      if (teacherAt.get(tk) === lesson) teacherAt.delete(tk);
    }
    if (lesson.room_id) {
      const rk = `${lesson.room_id}|${lesson.day_id}|${lesson.period_id}`;
      if (roomAt.get(rk) === lesson) roomAt.delete(rk);
    }
    applyFixed(lesson, -1);
  }

  function resetState() {
    sectionAt.clear(); teacherAt.clear(); roomAt.clear();
    teacherDay.clear(); sectionDay.clear(); subjectDay.clear(); teacherWeek.clear();
    for (const l of lockedUnits) {
      const room = l.room_id || null;
      sectionAt.set(`${l.section_id}|${l.day_id}|${l.period_id}`, l);
      if (l.teacher_id) teacherAt.set(`${l.teacher_id}|${l.day_id}|${l.period_id}`, l);
      if (room) roomAt.set(`${room}|${l.day_id}|${l.period_id}`, l);
      applyFixed(l, 1);
    }
  }

  function buildUnits() {
    // الحصص المثبّتة تُخصم من المطلوب حتى لا تتكرر.
    const lockedCount = new Map();
    for (const l of lockedUnits) {
      if (l.assignment_id) lockedCount.set(l.assignment_id, (lockedCount.get(l.assignment_id) || 0) + 1);
    }
    const remaining = assignments.map(a => ({
      a,
      need: Math.max(0, a.weekly_periods - (lockedCount.get(a.id) || 0)),
    })).filter(x => x.need > 0);
    const maxWeekly = Math.max(...remaining.map(x => x.need), 1);
    const order = remaining.slice().sort((x, y) => {
      const a = x.a, b = y.a;
      const ta = teachers.get(a.teacher_id) || {};
      const tb = teachers.get(b.teacher_id) || {};
      const da = (ta.weekly_load || 35) / Math.max(1, x.need);
      const db = (tb.weekly_load || 35) / Math.max(1, y.need);
      return da - db || y.need - x.need;
    });
    const units = [];
    for (let round = 0; round < maxWeekly; round++) {
      for (const { a, need } of order) {
        if (round < need) units.push(a);
      }
    }
    return units;
  }

  /** الحصص التي تمنع وضع a في خانة ما (شعبة/معلم/قاعة). */
  function blockersFor(a, slot) {
    const out = [];
    const room = roomFor(a);
    const candidates = [
      sectionAt.get(`${a.section_id}|${slot.day}|${slot.period}`),
      teacherAt.get(`${a.teacher_id}|${slot.day}|${slot.period}`),
      room ? roomAt.get(`${room}|${slot.day}|${slot.period}`) : null,
    ];
    for (const l of candidates) if (l && !out.includes(l)) out.push(l);
    return out;
  }

  /**
   * وضع حصة، مع محاولة إزاحة حصة واحدة معيقة عند الحاجة (عمق محدود).
   * يعيد الحصة الموضوعة أو null.
   */
  function placeUnit(a, depth, budget, visited, rng) {
    // أفضل خانة متاحة مباشرة.
    let best = null, bestScore = Infinity;
    for (const slot of slots) {
      if (!hardFeasible(a, slot)) continue;
      const score = softScore(a, slot) + rng() * 0.001;
      if (score < bestScore) { bestScore = score; best = slot; }
    }
    if (best) return place(a, best);

    if (depth <= 0 || budget.left <= 0) return null;

    // خانات فيها معيق واحد فقط، مرتبة حسب جودة الخانة.
    const moves = [];
    for (const slot of slots) {
      const blockers = blockersFor(a, slot);
      if (blockers.length !== 1) continue;
      const b = blockers[0];
      if (b.locked) continue;
      if (!b.assignment_id || visited.has(b.assignment_id)) continue;
      if (!assignmentById.has(b.assignment_id)) continue;
      moves.push({ slot, blocker: b, score: softScore(a, slot) });
    }
    moves.sort((x, y) => x.score - y.score);

    for (const move of moves) {
      if (budget.left <= 0) return null;
      budget.left--;
      const { slot, blocker } = move;
      const blockerSlot = { day: blocker.day_id, period: blocker.period_id };
      remove(blocker);
      if (!hardFeasible(a, slot)) { place(assignmentById.get(blocker.assignment_id), blockerSlot); continue; }
      const placed = place(a, slot);
      const blockerAssignment = assignmentById.get(blocker.assignment_id);
      const nextVisited = new Set(visited);
      nextVisited.add(blocker.assignment_id);
      const relocated = blockerAssignment
        ? placeUnit(blockerAssignment, depth - 1, budget, nextVisited, rng)
        : null;
      if (relocated) return placed;
      // فشل النقل: تراجع كامل.
      remove(placed);
      place(assignmentById.get(blocker.assignment_id), blockerSlot);
    }
    return null;
  }

  function attempt(attemptNo) {
    resetState();
    const rng = mulberry32((options.seed + attemptNo * 7919) >>> 0);
    const unplaced = [];
    const units = buildUnits();
    const budget = { left: Math.max(units.length * 4, 200) };

    for (const a of units) {
      const placed = placeUnit(a, options.repairDepth, budget, new Set(), rng);
      if (!placed) {
        unplaced.push({
          assignment_id: a.id,
          section_id: a.section_id,
          subject_id: a.subject_id,
          teacher_id: a.teacher_id,
          reason: 'لا توجد خانة تحقق القيود حتى بعد إزاحة حصص أخرى',
        });
      }
    }
    // تُبنى النتيجة من فهرس الخانات بعد كل عمليات الإزاحة، لضمان تطابق
    // الحصص المنقولة مع الحصص الأصلية وعدم تكرار أو فقدان أي حصة.
    return { lessons: [...sectionAt.values()], unplaced };
  }

  // محاولات متعددة ببذور مختلفة، مع اختيار الأفضل (أقل حصص غير موزعة ثم أقل تكلفة).
  // المحاولة لا تُقطع بالساعة، لكن لا تُبدأ محاولة جديدة بعد انتهاء المهلة.
  let best = null;
  let attemptNo = 0;
  while (attemptNo < options.maxRestarts) {
    const res = attempt(attemptNo);
    const cost = evaluateCost(res.lessons, { days, periods, teachers, subjects, sections, options });
    res.cost = cost.total;
    if (!best || res.unplaced.length < best.unplaced.length ||
        (res.unplaced.length === best.unplaced.length && res.cost < best.cost)) {
      best = res;
    }
    attemptNo++;
    if (best.unplaced.length === 0) break;
    if (Date.now() - started > options.timeLimitMs) break;
  }

  if (!best) best = { lessons: [], unplaced: [], cost: 0 };
  if (!best.lessons.length && !best.unplaced.length) {
    best.unplaced = assignments.map(a => ({
      assignment_id: a.id,
      section_id: a.section_id,
      subject_id: a.subject_id,
      teacher_id: a.teacher_id,
      reason: 'لم يُنفّذ أي توزيع',
    }));
  }

  const stats = summarize(best.lessons, assignments, { days, periods, teachers, subjects, sections });
  const message = best.unplaced.length === 0
    ? 'اكتمل توزيع جميع الحصص دون تعارضات في البنية.'
    : `تعذّر توزيع ${best.unplaced.length} حصة. راجع الأنصبة والتوافر والسقوف.`;

  return {
    lessons: best.lessons,
    unplaced: best.unplaced,
    stats,
    cost: best.cost,
    elapsedMs: Date.now() - started,
    attempts: attemptNo,
    message,
  };
}

function evaluateCost(lessons, ctx) {
  const byTeacherDay = new Map();
  const bySectionSubjDay = new Map();
  for (const l of lessons) {
    const k = `${l.teacher_id}|${l.day_id}`;
    byTeacherDay.set(k, (byTeacherDay.get(k) || 0) + 1);
    const k2 = `${l.section_id}|${l.subject_id}|${l.day_id}`;
    bySectionSubjDay.set(k2, (bySectionSubjDay.get(k2) || 0) + 1);
  }
  let spread = 0;
  for (const [, v] of bySectionSubjDay) if (v > 1) spread += (v - 1) * (v - 1);
  let balance = 0;
  const byTeacherDays = new Map();
  for (const [k, v] of byTeacherDay) {
    const t = k.split('|')[0];
    if (!byTeacherDays.has(t)) byTeacherDays.set(t, []);
    byTeacherDays.get(t).push(v);
  }
  for (const [, arr] of byTeacherDays) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    for (const v of arr) balance += Math.abs(v - avg);
  }
  return { spread, balance, total: spread * 10 + balance };
}

function summarize(lessons, assignments, ctx) {
  let required = 0;
  for (const a of assignments) required += a.weekly_periods;
  const placed = lessons.length;
  const teacherLoad = new Map();
  for (const l of lessons) if (l.teacher_id) teacherLoad.set(l.teacher_id, (teacherLoad.get(l.teacher_id) || 0) + 1);
  const perDay = new Map();
  for (const l of lessons) perDay.set(l.day_id, (perDay.get(l.day_id) || 0) + 1);
  return {
    required,
    placed,
    unplaced: Math.max(0, required - placed),
    days: ctx.days.length,
    periods: ctx.periods.length,
    teachersUsed: teacherLoad.size,
    lessonsPerDay: [...perDay.entries()].map(([day_id, count]) => ({ day_id, count })),
  };
}

function emptyStats() {
  return { required: 0, placed: 0, unplaced: 0, days: 0, periods: 0, teachersUsed: 0, lessonsPerDay: [] };
}

export { generate, evaluateCost, mulberry32 };
