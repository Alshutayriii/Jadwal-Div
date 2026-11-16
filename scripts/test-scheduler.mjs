/**
 * اختبار محرك الجدولة: يبني جدولًا لثلاث بذور ويتحقق من:
 *  - اكتمال الحصص (420/420) وعدم وجود عجز في أي إسناد.
 *  - عدم وجود تعارضات صارمة أو تنبيهات من كاشف التعارض.
 *  - مؤشر جودة لا يقل عن حدّ مقبول (80/100) عند التوليد من الصفر.
 * يعيد رمز خروج غير صفري عند أي فشل، ليمكن استخدامه في CI.
 */
import fs from 'node:fs';
import { generate } from '../src/lib/scheduler.js';
import { detect } from '../src/lib/conflicts.js';

const s = JSON.parse(fs.readFileSync(new URL('../src/data/seed.json', import.meta.url), 'utf8'));
const subjects = new Map(s.subjects.map((x) => [x.id, x]));
const teachers = new Map(s.teachers.map((x) => [x.id, x]));
const grades = new Map(s.grades.map((x) => [x.id, x]));
const sections = s.sections.map((x) => ({ ...x, grade_name: grades.get(x.grade_id)?.name || '', max_daily: 7 }));
const secMap = new Map(sections.map((x) => [x.id, x]));
const assignments = s.assignments.map((a) => ({
  ...a,
  subject_name: subjects.get(a.subject_id)?.name,
  max_per_day: subjects.get(a.subject_id)?.max_per_day,
  consecutive: subjects.get(a.subject_id)?.consecutive,
  needs_lab: subjects.get(a.subject_id)?.needs_lab,
  teacher_name: teachers.get(a.teacher_id)?.name,
  teacher_max_daily: teachers.get(a.teacher_id)?.max_daily,
  teacher_weekly_load: teachers.get(a.teacher_id)?.weekly_load,
  section_name: secMap.get(a.section_id)?.name,
  unavailable: [],
}));
const required = assignments.reduce((sum, a) => sum + a.weekly_periods, 0);
const input = {
  days: s.days.filter((d) => d.active),
  periods: s.periods.filter((p) => p.active),
  teachers: s.teachers.filter((t) => t.active),
  subjects: s.subjects.filter((x) => x.active),
  sections, rooms: s.rooms, assignments, locked: [],
  options: { sectionMaxDaily: 7, seed: 42, timeLimitMs: 7000, maxRestarts: 60 },
};

let failed = false;
const fail = (seed, message) => {
  failed = true;
  console.error(`✗ بذرة ${seed}: ${message}`);
};

for (const seed of [42, 7, 2026]) {
  const started = Date.now();
  const res = generate({ ...input, options: { ...input.options, seed } });
  const elapsed = Date.now() - started;

  const counts = new Map();
  for (const l of res.lessons) counts.set(l.assignment_id, (counts.get(l.assignment_id) || 0) + 1);
  const deficits = assignments.filter((a) => (counts.get(a.id) || 0) !== a.weekly_periods);
  const nulls = res.lessons.filter((l) => !l.assignment_id || !l.section_id || !l.day_id || !l.period_id);
  const conf = detect({
    days: input.days, periods: input.periods, teachers: input.teachers, subjects: input.subjects,
    sections: input.sections, rooms: input.rooms, assignments, teacherSubjects: s.teacher_subjects,
    unavailable: [], lessons: res.lessons, school: s.school[0],
  });

  console.log(JSON.stringify({
    seed, lessons: res.lessons.length, required, unplaced: res.unplaced.length, nulls: nulls.length,
    deficits: deficits.length, errors: conf.errors, warnings: conf.warnings,
    quality: res.quality?.score, grade: res.quality?.grade, gaps: res.quality?.teacherGaps,
    elapsedMs: elapsed, attempts: res.attempts,
  }));

  if (res.lessons.length !== required) fail(seed, `الحصص ${res.lessons.length} بدل ${required}`);
  if (res.unplaced.length) fail(seed, `حصص غير موزعة: ${res.unplaced.length}`);
  if (nulls.length) fail(seed, `حصص ناقصة الحقول: ${nulls.length}`);
  if (deficits.length) fail(seed, `إسنادات بعجز: ${deficits.length}`);
  if (conf.errors) fail(seed, `تعارضات صارمة: ${conf.errors}`);
  if (conf.warnings) fail(seed, `تنبيهات: ${conf.warnings}`);
  if ((res.quality?.score ?? 0) < 80) fail(seed, `الجودة ${res.quality?.score}/100 أقل من 80`);
}

if (failed) {
  console.error('\nفشل اختبار الجدولة.');
  process.exit(1);
}
console.log('\n✓ نجح اختبار الجدولة لثلاث بذور: اكتمال، بلا تعارض، جودة ≥ 80.');
