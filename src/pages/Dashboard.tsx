import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Layers, BookOpen, Grid3X3, AlertTriangle, ShieldCheck, CalendarDays, ArrowLeft,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../store';
import { activeSchedule, dayIdxForDate, enrich, scheduleLessons, todayIso } from '../lib/model';
import { detect } from '../lib/conflicts';
import { Badge, Card, PageHeader, StatCard } from '../components/ui';

const TL: Record<string, string> = {
  teacher_clash: 'تعارض معلم', section_clash: 'تعارض شعبة', room_clash: 'تعارض قاعة',
  unplaced: 'حصص غير موزعة', no_teacher: 'إسناد بلا معلم', teacher_overload: 'تجاوز نصاب',
  teacher_daily: 'تجاوز حد يومي', section_daily: 'سقف يوم الشعبة', unqualified: 'معلم غير مؤهل',
  unavailable: 'معلم غير متاح', subject_repeat: 'تكرار مادة', lab_missing: 'معمل ناقص',
  consecutive: 'تجاوز التجاور',
};

export default function Dashboard() {
  const db = useApp((s) => s.db);
  const sch = activeSchedule(db);
  const lessons = useMemo(() => (sch ? scheduleLessons(db, sch.id) : []), [db, sch]);
  const ctx = useMemo(() => enrich(db), [db]);
  const conflicts = useMemo(() => detect({ ...ctx, lessons, school: db.school }), [ctx, lessons, db.school]);

  const required = db.assignments.reduce((s, a) => s + Number(a.weekly_periods || 0), 0);
  const todayIdx = dayIdxForDate(todayIso());
  const today = db.days.find((d) => d.idx === todayIdx);
  const todayLessons = today ? lessons.filter((l) => l.day_id === today.id) : [];
  const subjectsData = db.subjects.map((s) => ({
    name: s.name.length > 12 ? `${s.name.slice(0, 12)}…` : s.name,
    حصص: lessons.filter((l) => l.subject_id === s.id).length,
  })).sort((a, b) => b.حصص - a.حصص);

  const vacantDuties = db.duties.filter((d) => !d.teacher_id).length;
  const todayCovers = db.covers.filter((c) => c.date === todayIso()).length;

  return (
    <div>
      <PageHeader
        icon={Grid3X3}
        title="لوحة التحكم"
        subtitle={`${db.school.name} · ${db.school.academic_year} · ${db.school.term}`}
        actions={<Badge tone={sch?.status === 'published' ? 'green' : 'amber'}>{sch ? `${sch.name} — ${sch.status === 'published' ? 'منشور' : 'مسودة'}` : 'لا يوجد جدول'}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="المعلمون" value={db.teachers.filter((t) => t.active !== 0).length} hint={`${db.teachers.length} سجل`} icon={Users} />
        <StatCard label="الشعب" value={db.sections.filter((s) => s.active !== 0).length} hint={`${db.grades.length} صفوف`} icon={Layers} tone="teal" />
        <StatCard label="المواد" value={db.subjects.filter((s) => s.active !== 0).length} hint={`${db.assignments.length} إسنادًا`} icon={BookOpen} tone="amber" />
        <StatCard label="الحصص الموزعة" value={`${lessons.length} / ${required}`} hint={`${db.days.length} أيام · ${db.periods.filter((p) => p.kind !== 'break').length} حصص`} icon={Grid3X3} tone={lessons.length >= required ? 'green' : 'rose'} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="أخطاء التعارض" value={conflicts.errors} hint={`${conflicts.warnings} تنبيهًا`} icon={AlertTriangle} tone={conflicts.errors ? 'rose' : 'green'} />
        <StatCard label="مناوبات شاغرة" value={vacantDuties} hint={`${db.duties.length} مناوبة`} icon={ShieldCheck} tone={vacantDuties ? 'amber' : 'green'} />
        <StatCard label="غياب اليوم" value={todayCovers} hint="حصص انتظار مسجلة" icon={CalendarDays} tone="amber" />
        <StatCard label="الأنشطة القادمة" value={db.calendar_events.filter((e) => e.start_date >= todayIso()).length} hint="من التقويم الدراسي" icon={CalendarDays} tone="teal" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-extrabold">توزيع الحصص على المواد</h2>
            <Link to="/reports" className="btn-ghost btn-sm">التقارير <ArrowLeft size={14} /></Link>
          </div>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectsData} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={52} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ direction: 'rtl', fontFamily: 'Cairo', fontSize: 12, borderRadius: 12 }} />
                <Bar dataKey="حصص" fill="#4338ca" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold">حصص اليوم</h2>
            <Badge tone="brand">{today ? today.name : 'يوم غير دراسي'}</Badge>
          </div>
          {todayLessons.length ? (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pl-1">
              {todayLessons.slice(0, 30).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                  <span className="truncate font-semibold">{l.subject_name}</span>
                  <span className="shrink-0 text-slate-400">{l.grade_name} {l.section_name} · {l.period_name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">لا حصص اليوم. تحقق من التقويم أو اليوم النشط.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-extrabold">أحدث التعارضات والتنبيهات</h2>
          <Link to="/timetable" className="btn-ghost btn-sm">إدارة الجدول <ArrowLeft size={14} /></Link>
        </div>
        {conflicts.conflicts.length ? (
          <div className="space-y-2">
            {conflicts.conflicts.slice(0, 6).map((c: any) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                <Badge tone={c.severity === 'error' ? 'rose' : 'amber'}>{TL[c.type] || c.type}</Badge>
                <span className="font-semibold">{c.entity}</span>
                <span className="text-xs text-slate-400">{c.slot}</span>
                <span className="w-full text-xs text-slate-500 sm:w-auto sm:flex-1">{c.reason}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            لا تعارضات في الجدول الحالي. يمكنك النشر بأمان.
          </p>
        )}
      </Card>
    </div>
  );
}
