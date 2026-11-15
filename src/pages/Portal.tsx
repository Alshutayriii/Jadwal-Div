import { useMemo, useState } from 'react';
import { CalendarDays, Printer, UserRound } from 'lucide-react';
import { useApp } from '../store';
import { activeSchedule, scheduleLessons } from '../lib/model';
import { Badge, Card, PageHeader } from '../components/ui';

export default function Portal() {
  const { db, session } = useApp();
  const isTeacher = session?.role === 'teacher';
  const [teacherId, setTeacherId] = useState<number>(session?.teacherId || db.teachers[0]?.id || 0);
  const teacher = db.teachers.find((t) => t.id === (isTeacher ? session?.teacherId : teacherId));
  const sch = activeSchedule(db);
  const lessons = useMemo(() => (sch ? scheduleLessons(db, sch.id) : []), [db, sch]);
  const mine = lessons.filter((l) => l.teacher_id === teacher?.id);
  const days = db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx);
  const periods = db.periods.filter((p) => p.active !== 0 && p.kind !== 'break').sort((a, b) => a.idx - b.idx);
  const duties = db.duties.filter((d) => d.teacher_id === teacher?.id);
  const covers = db.covers.filter((c) => c.substitute_id === teacher?.id);

  if (!teacher) return <Card>لا يوجد معلم مرتبط بهذا الحساب.</Card>;

  return (
    <div>
      <PageHeader
        icon={UserRound}
        title="بوابة المعلم"
        subtitle={`${teacher.name} · ${teacher.specialty}`}
        actions={
          <>
            {!isTeacher ? (
              <select className="input max-w-xs" value={teacherId} onChange={(e) => setTeacherId(Number(e.target.value))}>
                {db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : null}
            <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> طباعة</button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="card p-4"><div className="text-xs text-slate-400">النصاب الأسبوعي</div><div className="text-2xl font-extrabold">{teacher.weekly_load}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-400">الحصص الموزعة</div><div className="text-2xl font-extrabold">{mine.length}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-400">المناوبات</div><div className="text-2xl font-extrabold">{duties.length}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-400">حصص الانتظار</div><div className="text-2xl font-extrabold">{covers.length}</div></div>
      </div>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 flex items-center gap-2 font-extrabold"><CalendarDays size={17} /> الجدول الأسبوعي</h2>
        <table className="w-full min-w-[760px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-28 rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">الحصة</th>
              {days.map((d) => <th key={d.id} className="rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">{d.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="rounded-xl bg-slate-50 p-2 text-center text-[11px] font-bold dark:bg-slate-900">{p.name}<div className="font-normal text-slate-400">{p.start_time}</div></td>
                {days.map((d) => {
                  const l = mine.find((x) => x.day_id === d.id && x.period_id === p.id);
                  return (
                    <td key={d.id} className="rounded-xl border border-slate-200 p-2 text-center align-middle text-[11px] dark:border-slate-800" style={{ background: l ? `${l.subject_color}22` : undefined }}>
                      {l ? (
                        <>
                          <div className="font-extrabold" style={{ color: l.subject_color }}>{l.subject_name}</div>
                          <div className="text-slate-500">{l.grade_name} {l.section_name}</div>
                          <div className="text-[10px] text-slate-400">{l.room_name || '—'}</div>
                        </>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-extrabold">مناوبات الإشراف</h2>
          {duties.length ? duties.slice(0, 12).map((d) => (
            <div key={d.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
              <span>{db.days.find((x) => x.id === d.day_id)?.name}</span>
              <span>{db.supervision_areas.find((a) => a.id === d.area_id)?.name}</span>
              <span className="text-slate-400">{db.periods.find((p) => p.id === d.period_id)?.name}</span>
            </div>
          )) : <p className="py-4 text-center text-xs text-slate-400">لا مناوبات.</p>}
        </Card>
        <Card>
          <h2 className="mb-2 font-extrabold">حصص الانتظار</h2>
          {covers.length ? covers.slice(0, 12).map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0 dark:border-slate-800">
              <span>{c.date}</span>
              <span>{db.subjects.find((s) => s.id === c.subject_id)?.name}</span>
              <Badge tone={c.status === 'assigned' ? 'green' : 'amber'}>{c.status === 'assigned' ? 'مكلفة' : 'ناقصة'}</Badge>
            </div>
          )) : <p className="py-4 text-center text-xs text-slate-400">لا حصص انتظار.</p>}
        </Card>
      </div>
    </div>
  );
}
