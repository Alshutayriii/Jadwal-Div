import fs from 'node:fs';
import { generate } from '../src/lib/scheduler.js';

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
}));
const input = {
  days: s.days.filter((d) => d.active), periods: s.periods.filter((p) => p.active),
  teachers: s.teachers.filter((t) => t.active), subjects: s.subjects.filter((x) => x.active),
  sections, rooms: s.rooms, assignments, locked: [],
  options: { sectionMaxDaily: 7, seed: 42, timeLimitMs: 7000, maxRestarts: 60 },
};
const res = generate(input);
console.log('lessons', res.lessons.length, 'unplaced', res.unplaced.length, 'nulls', res.lessons.filter((l) => !l.assignment_id).length);
console.log(res.lessons.filter((l) => !l.assignment_id).slice(0, 3));
const counts = new Map();
for (const l of res.lessons) counts.set(l.assignment_id, (counts.get(l.assignment_id) || 0) + 1);
console.log('deficits', assignments.filter((a) => (counts.get(a.id) || 0) !== a.weekly_periods).map((a) => [a.id, a.weekly_periods, counts.get(a.id) || 0]));
