import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Monitor, Printer } from 'lucide-react';
import { useApp } from '../store';
import { activeSchedule, dayIdxForDate, scheduleLessons, todayIso } from '../lib/model';
import { Badge, Card, PageHeader } from '../components/ui';

export default function Tv() {
  const { db } = useApp();
  const todayId = dayIdxForDate(todayIso());
  const [dayId, setDayId] = useState<number>(db.days.find((d) => d.idx === todayId)?.id || db.days[0]?.id || 0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const sch = activeSchedule(db);
  const all = useMemo(() => (sch ? scheduleLessons(db, sch.id) : []), [db, sch]);
  const lessons = all.filter((l) => l.day_id === dayId);
  const periods = db.periods.filter((p) => p.active !== 0).sort((a, b) => a.idx - b.idx);
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const current = periods.find((p) => p.kind !== 'break' && p.start_time && p.end_time && currentTime >= p.start_time && currentTime < p.end_time);

  return (
    <div>
      <PageHeader
        icon={Monitor}
        title="شاشة العرض المدرسية"
        subtitle={`${db.school.name} · ${db.days.find((d) => d.id === dayId)?.name || ''} · ${currentTime}`}
        actions={
          <>
            <select className="input max-w-[10rem]" value={dayId} onChange={(e) => setDayId(Number(e.target.value))}>
              {db.days.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn-ghost" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 size={15} /> ملء الشاشة</button>
            <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> طباعة</button>
          </>
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-extrabold">{db.school.name}</div>
            <div className="text-xs text-slate-400">{db.school.academic_year} · {db.school.term}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black tabular-nums">{currentTime}</span>
            {current ? <Badge tone="green">الآن: {current.name}</Badge> : <Badge tone="slate">لا حصة جارية</Badge>}
          </div>
        </div>

        <div className="space-y-2">
          {periods.map((p) => {
            const rows = lessons.filter((l) => l.period_id === p.id);
            const isNow = current?.id === p.id;
            return (
              <div key={p.id} className={`rounded-2xl border p-3 ${isNow ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-extrabold">
                    {p.name}
                    {p.kind === 'break' ? <Badge tone="amber">فسحة</Badge> : null}
                    {isNow ? <Badge tone="green">جارية</Badge> : null}
                  </div>
                  <span className="text-xs text-slate-400">{p.start_time} - {p.end_time}</span>
                </div>
                {rows.length ? (
                  <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                    {rows.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-1.5 text-[11px] shadow-sm dark:bg-slate-950">
                        <span className="truncate font-bold" style={{ color: l.subject_color }}>{l.subject_name}</span>
                        <span className="shrink-0 text-slate-500">{l.grade_name} {l.section_name}</span>
                        <span className="shrink-0 text-slate-400">{l.teacher_name?.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400">{p.kind === 'break' ? 'استراحة' : 'لا حصص'}</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
