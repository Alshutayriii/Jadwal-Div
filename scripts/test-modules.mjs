/**
 * اختبار الوحدات الجديدة: جدول الاختبارات، التوزيع التلقائي للإسنادات، والاستيراد.
 * يُجمّع ملفات TypeScript عبر esbuild ثم يشغّل التحققات، ويعيد رمز خروج غير صفري عند أي فشل.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const outfile = path.join(os.tmpdir(), `stp-modules-${Date.now()}.mjs`);

const entry = `
import seedJson from './src/data/seed.json';
import { generateExams, examConflicts, examsCsv, examPeriods } from './src/lib/exams';
import { autoAssignTeachers } from './src/lib/assignments';
import { importTable } from './src/lib/importExport';

const raw = JSON.parse(JSON.stringify(seedJson));
const settings = {};
for (const row of raw.settings || []) settings[row.key] = String(row.value);
delete settings.permissions;
const db = {
  school: raw.school[0], terms: raw.terms || [], days: raw.days || [], periods: raw.periods || [],
  rooms: raw.rooms || [], grades: raw.grades || [], sections: raw.sections || [],
  subjects: raw.subjects || [], teachers: raw.teachers || [],
  teacher_subjects: raw.teacher_subjects || [], teacher_unavailable: raw.teacher_unavailable || [],
  assignments: raw.assignments || [], exams: [], schedules: raw.schedules || [], lessons: raw.lessons || [],
  absences: [], covers: [], supervision_areas: [], duties: [], calendar_events: [],
  users: [], notifications: [], audit_log: [], settings, permissions: {}, version: 2,
};

let failed = 0;
function check(name, ok, detail = '') {
  console.log(ok ? '✓' : '✗', name + (detail ? ' — ' + detail : ''));
  if (!ok) failed += 1;
}

const generated = generateExams(db);
check('توليد اختبار لكل شعبة ومادة', generated.placed === db.sections.length * db.subjects.length,
  generated.placed + '/' + (db.sections.length * db.subjects.length));
check('كل الاختبارات وُضعت دون عجز', generated.unplaced.length === 0, 'unplaced=' + generated.unplaced.length);
const diag = examConflicts(db, generated.exams);
check('لا تعارضات صارمة بعد التوليد', diag.errors === 0, diag.issues.filter((i) => i.severity === 'error').map((i) => i.message).slice(0, 3).join(' | '));
check('كل اختبار له قاعة ومراقب', generated.exams.every((e) => e.room_id && e.invigilator_id));

const slotKey = (e) => [e.day_id, e.period_id].join('|');
const secSlots = new Set(generated.exams.map((e) => [e.section_id, slotKey(e)].join('|')));
const roomSlots = new Set(generated.exams.map((e) => [e.room_id, slotKey(e)].join('|')));
const teacherSlots = new Set(generated.exams.map((e) => [e.invigilator_id, slotKey(e)].join('|')));
check('لا تعارض شعبة/قاعة/مراقب', secSlots.size === generated.exams.length && roomSlots.size === generated.exams.length && teacherSlots.size === generated.exams.length);
check('عدد حصص الاختبار في اليوم محترم', db.sections.every((s) => {
  const counts = {};
  for (const e of generated.exams.filter((x) => x.section_id === s.id)) counts[e.day_id] = (counts[e.day_id] || 0) + 1;
  return Object.values(counts).every((n) => n <= 3);
}));
check('عدد حصص الاختبار اليومية = 3', examPeriods(db).length === 3);

// احترام عدم توفر المراقب.
const blocked = db.teachers[0];
const firstDay = db.days.find((d) => d.active !== 0);
const firstPeriod = examPeriods(db)[0];
const dbBlocked = { ...db, teacher_unavailable: [{ id: 1, teacher_id: blocked.id, day_id: firstDay.id, period_id: firstPeriod.id }] };
const generatedBlocked = generateExams(dbBlocked);
check('لا يُكلّف مراقبًا غير متاح',
  !generatedBlocked.exams.some((e) => e.invigilator_id === blocked.id && e.day_id === firstDay.id && e.period_id === firstPeriod.id));

// التوزيع التلقائي: إفراغ ثلاثة إسنادات ثم إعادة توزيعها.
const dbAssign = JSON.parse(JSON.stringify(db));
for (const a of dbAssign.assignments.slice(0, 3)) a.teacher_id = null;
const assignResult = autoAssignTeachers(dbAssign, { overwrite: false, respectLoad: true, preferQualified: true });
check('توزيع الإسنادات الفارغة تلقائيًا', assignResult.assigned === 3, 'assigned=' + assignResult.assigned);
check('لا مرشح ناقص في بيانات البذرة', assignResult.unresolved.length === 0, 'unresolved=' + assignResult.unresolved.length);
const loadAfter = {};
for (const a of dbAssign.assignments) if (a.teacher_id) loadAfter[a.teacher_id] = (loadAfter[a.teacher_id] || 0) + a.weekly_periods;
check('التوزيع لا يتجاوز النصاب', Object.entries(loadAfter).every(([id, n]) => n <= (dbAssign.teachers.find((t) => t.id === Number(id))?.weekly_load || 0)));

// الاستيراد: إضافة وتحديث.
const teacherName = db.teachers[0].name;
const imp = importTable(db, 'teachers', [
  { name: teacherName, employee_no: db.teachers[0].employee_no, specialty: 'تجريبي', weekly_load: '12' },
  { name: 'معلم مستورد', employee_no: '9999', specialty: 'العلوم', weekly_load: '10', max_daily: '6' },
]);
check('استيراد معلم: تحديث وإضافة', imp.updated === 1 && imp.added === 1, 'added=' + imp.added + ' updated=' + imp.updated);
check('تحديث الحقول المستوردة', imp.db.teachers.find((t) => t.employee_no === '9999')?.specialty === 'العلوم');
check('لا تكرار عند إعادة الاستيراد', importTable(imp.db, 'teachers', [{ name: teacherName, employee_no: db.teachers[0].employee_no }]).added === 0);

const gradeName = db.grades[0].name;
const secImp = importTable(db, 'sections', [{ grade: gradeName, section: 'اختبار', students: '33' }]);
check('استيراد شعبة جديدة', secImp.added === 1 && secImp.db.sections.some((s) => s.name === 'اختبار'));

const firstAssignment = db.assignments[0];
const sec = db.sections.find((s) => s.id === firstAssignment.section_id);
const grade = db.grades.find((g) => g.id === sec.grade_id);
const subject = db.subjects.find((s) => s.id === firstAssignment.subject_id);
const teacher = db.teachers.find((t) => t.id === firstAssignment.teacher_id);
const asgImp = importTable(db, 'assignments', [{
  grade: grade.name, section: sec.name, subject: subject.name, teacher: teacher.name,
  weekly_periods: String(firstAssignment.weekly_periods + 1),
}]);
check('استيراد إسناد موجود يحدّثه', asgImp.updated === 1 && asgImp.added === 0);

const csv = examsCsv(db, generated.exams);
check('تصدير CSV بترميز عربي وصفوف كافية', csv.startsWith('\\uFEFF') && csv.split('\\r\\n').length > generated.exams.length);

if (failed) {
  console.error('\\nفشل ' + failed + ' تحققًا.');
  process.exit(1);
}
console.log('\\nكل تحققات الوحدات الجديدة ناجحة.');
`;

fs.writeFileSync(path.join(os.tmpdir(), 'stp-modules-entry.ts'), entry);
await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  logLevel: 'silent',
});
await import(pathToFileURL(outfile).href);
