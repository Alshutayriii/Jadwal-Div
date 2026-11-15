import { useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Trash2, UserMinus, Wand2 } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { todayIso } from '../lib/model';
import { Badge, Card, Field, PageHeader } from '../components/ui';

export default function Absence() {
  const { db, allocateAbsences, setCoverSubstitute, clearCovers, toast } = useApp();
  const canEdit = usePerm('absence', 'edit');
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [result, setResult] = useState<any>(null);

  const teachers = useMemo(
    () => db.teachers.filter((t) => t.active !== 0 && (!q || t.name.includes(q) || t.specialty.includes(q))),
    [db.teachers, q],
  );
  const dayIdx = new Date(`${date}T12:00:00`).getDay() + 1;
  const day = db.days.find((d) => d.idx === dayIdx);
  const savedCovers = db.covers.filter((c) => c.date === date);
  const savedAbsences = db.absences.filter((a) => a.date === date);

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function allocate() {
    try {
      const res = allocateAbsences(date, selected.length ? selected : savedAbsences.map((a) => a.teacher_id), reason);
      setResult(res);
      toast(res.unfilled ? 'info' : 'ok', `غُطيت ${res.assigned} من ${res.affected} حصة`);
      setSelected([]);
    } catch (err: any) { toast('err', err.message); }
  }

  function changeSub(lessonId: number, teacherId: number) {
    const cover = db.covers.find((c) => c.date === date && c.lesson_id === lessonId);
    if (!cover) return;
    try {
      setCoverSubstitute(cover.id, teacherId);
      toast('ok', 'تم تغيير البديل');
    } catch (err: any) { toast('err', err.message); }
  }

  function clear() {
    if (!confirm('حذف غياب اليوم وكل تكليفات الانتظار له؟')) return;
    clearCovers(date);
    setResult(null);
    toast('ok', 'تم الحذف');
  }

  const items = result?.items || savedCovers.map((c) => ({
    lesson_id: c.lesson_id, period_id: c.period_id,
    section_name: db.sections.find((s) => s.id === c.section_id)?.name || '',
    subject_name: db.subjects.find((s) => s.id === c.subject_id)?.name || '',
    absent_teacher_name: db.teachers.find((t) => t.id === c.absent_teacher_id)?.name || '',
    substitute_id: c.substitute_id,
    substitute_name: db.teachers.find((t) => t.id === c.substitute_id)?.name || null,
    status: c.status, note: c.note, candidates: [],
  }));
  const periods = db.periods.slice().sort((a, b) => a.idx - b.idx);

  return (
    <div>
      <PageHeader
        icon={UserMinus}
        title="الغياب وحصص الانتظار"
        subtitle="توزيع تلقائي عادل مع منع تعارض الحصص والإشراف والسقوف"
        actions={canEdit ? <button className="btn-ghost text-rose-600" onClick={clear} disabled={!savedCovers.length && !savedAbsences.length}><Trash2 size={16} /> حذف غياب اليوم</button> : null}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <div className="grid gap-3">
            <Field label="التاريخ" hint={day ? `يوافق ${day.name}` : 'يوم غير دراسي (جمعة/سبت أو معطّل)'}>
              <input className="input" type="date" value={date} onChange={(e) => { setDate(e.target.value); setResult(null); }} />
            </Field>
            <Field label="السبب (اختياري)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مرضي، مهمة رسمية…" /></Field>
            <Field label="بحث عن معلم"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم أو تخصص" /></Field>
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
            {teachers.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.includes(t.id) || savedAbsences.some((a) => a.teacher_id === t.id)} onChange={() => toggle(t.id)} disabled={savedAbsences.some((a) => a.teacher_id === t.id)} />
                  <span className="font-semibold">{t.name}</span>
                </span>
                <span className="text-[11px] text-slate-400">{t.specialty}</span>
              </label>
            ))}
          </div>

          <button className="btn-primary mt-3 w-full" onClick={allocate} disabled={!canEdit || (!selected.length && !savedAbsences.length)}>
            <Wand2 size={16} /> توزيع تلقائي
          </button>
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            يُستبعد الغائب والمشغول بحصة أو مناوبة، ويُفضّل التخصص، مع سقف يومي وأسبوعي. غير المغطى يظهر صراحةً.
          </p>
        </Card>

        <Card className="xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold">حصص الانتظار — {date}</h2>
            <div className="flex gap-2">
              <Badge tone="brand">{items.length} حصة متأثرة</Badge>
              <Badge tone={items.some((i: any) => i.status !== 'assigned') ? 'amber' : 'green'}>
                مغطاة {items.filter((i: any) => i.status === 'assigned').length}
              </Badge>
            </div>
          </div>

          {items.length ? (
            <div className="space-y-2">
              {items.map((item: any) => (
                <div key={item.lesson_id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="slate">{periods.find((p) => p.id === item.period_id)?.name || '—'}</Badge>
                    <span className="font-bold">{item.section_name}</span>
                    <span className="text-slate-500">{item.subject_name}</span>
                    <span className="text-xs text-slate-400">الغائب: {item.absent_teacher_name}</span>
                    <div className="flex-1" />
                    <Badge tone={item.status === 'assigned' ? 'green' : 'rose'}>{item.status === 'assigned' ? 'مغطاة' : 'غير مغطاة'}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      className="input max-w-xs py-1.5 text-xs"
                      value={item.substitute_id || ''}
                      onChange={(e) => changeSub(item.lesson_id, Number(e.target.value))}
                      disabled={!canEdit}
                    >
                      <option value="">— اختر بديلًا —</option>
                      {(item.candidates || []).map((c: any) => (
                        <option key={c.teacher_id} value={c.teacher_id}>
                          {c.name} ({c.score}{c.qualified ? ' · مؤهل' : ''})
                        </option>
                      ))}
                      {!item.candidates?.length ? db.teachers.filter((t) => t.active !== 0).map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : null}
                    </select>
                    {item.note ? <span className="text-[11px] text-amber-700 dark:text-amber-300">{item.note}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400 dark:border-slate-700">
              <CheckCircle2 className="text-emerald-500" />
              لا غياب مسجل في هذا التاريخ. اختر المعلمين ثم «توزيع تلقائي».
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-2 font-extrabold"><RefreshCw size={16} /> سجل الغياب</h2>
        {db.absences.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="table-th">التاريخ</th><th className="table-th">المعلم</th><th className="table-th">السبب</th><th className="table-th">حصص متأثرة</th><th className="table-th">مغطاة</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {db.absences.slice().sort((a, b) => b.date.localeCompare(a.date)).map((a) => {
                  const cov = db.covers.filter((c) => c.absence_id === a.id);
                  return (
                    <tr key={a.id}>
                      <td className="table-td">{a.date}</td>
                      <td className="table-td">{db.teachers.find((t) => t.id === a.teacher_id)?.name}</td>
                      <td className="table-td">{a.reason || '—'}</td>
                      <td className="table-td">{cov.length}</td>
                      <td className="table-td">{cov.filter((c) => c.status === 'assigned').length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="py-6 text-center text-sm text-slate-400">لا سجلات غياب بعد.</p>}
      </Card>
    </div>
  );
}
