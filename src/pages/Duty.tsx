import { useMemo, useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2, Wand2 } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, Card, Field, Modal, PageHeader, cn } from '../components/ui';

export default function Duty() {
  const { db, saveEntity, deleteEntity, generateDutiesAll, updateDuty, setSetting, toast } = useApp();
  const canEdit = usePerm('duty', 'edit');
  const days = db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx);
  const allPeriods = db.periods.filter((p) => p.active !== 0).sort((a, b) => a.idx - b.idx);
  const lessonPeriods = allPeriods.filter((p) => p.kind !== 'break');
  const [dutyPeriods, setDutyPeriods] = useState<number[]>(() => {
    try { const ids = JSON.parse(db.settings.duty_periods || '[]'); return Array.isArray(ids) ? ids : []; } catch { return []; }
  });
  const [result, setResult] = useState<any>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaForm, setAreaForm] = useState<any>({ name: '', kind: 'corridor', active: 1 });
  const [editingArea, setEditingArea] = useState<number | null>(null);
  const [cell, setCell] = useState<any>(null);

  const areas = db.supervision_areas.filter((a) => a.active !== 0);
  const shownPeriods = dutyPeriods.length
    ? allPeriods.filter((p) => dutyPeriods.includes(p.id))
    : allPeriods;

  const byCell = useMemo(() => {
    const map = new Map<string, any>();
    for (const d of db.duties) map.set(`${d.area_id}-${d.day_id}-${d.period_id}`, d);
    return map;
  }, [db.duties]);

  function togglePeriod(id: number) {
    const next = dutyPeriods.includes(id) ? dutyPeriods.filter((x) => x !== id) : [...dutyPeriods, id];
    setDutyPeriods(next);
    setSetting('duty_periods', JSON.stringify(next));
  }

  function generate() {
    try {
      const res = generateDutiesAll();
      setResult(res);
      toast(res.vacant ? 'info' : 'ok', `تم توليد ${res.duties.length} مناوبة${res.vacant ? `، منها ${res.vacant} شاغرة` : ''}`);
    } catch (err: any) { toast('err', err.message); }
  }

  function saveArea(e: React.FormEvent) {
    e.preventDefault();
    try {
      saveEntity('supervision_areas', { ...areaForm, active: areaForm.active ? 1 : 0 }, editingArea);
      setAreaOpen(false);
      toast('ok', 'تم حفظ موقع الإشراف');
    } catch (err: any) { toast('err', err.message); }
  }

  function saveDuty(e: React.FormEvent) {
    e.preventDefault();
    try {
      updateDuty(cell.duty.id, { teacher_id: cell.teacherId ? Number(cell.teacherId) : null, status: cell.teacherId ? 'planned' : 'vacant' });
      setCell(null);
      toast('ok', 'تم تحديث المناوبة');
    } catch (err: any) { toast('err', err.message); }
  }

  return (
    <div>
      <PageHeader
        icon={ShieldCheck}
        title="الإشراف والمناوبة"
        subtitle={`${areas.length} موقعًا · ${db.duties.length} مناوبة`}
        actions={canEdit ? (
          <>
            <button className="btn-ghost" onClick={() => { setEditingArea(null); setAreaForm({ name: '', kind: 'corridor', active: 1 }); setAreaOpen(true); }}><Plus size={16} /> موقع</button>
            <button className="btn-primary" onClick={generate}><Wand2 size={16} /> توليد المناوبات</button>
          </>
        ) : null}
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div className="card p-3 text-sm"><span className="text-slate-400">المناوبات: </span><b>{db.duties.length}</b></div>
        <div className="card p-3 text-sm"><span className="text-slate-400">شاغرة: </span><b className={db.duties.some((d) => !d.teacher_id) ? 'text-rose-600' : 'text-emerald-600'}>{db.duties.filter((d) => !d.teacher_id).length}</b></div>
        <div className="card p-3 text-sm"><span className="text-slate-400">آخر توليد: </span><b>{result ? `${result.duties.length} مناوبة` : '—'}</b></div>
      </div>

      <Card className="mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-extrabold">فترات الإشراف</h2>
          {canEdit ? (
            <div className="flex gap-1">
              <button type="button" className="btn-ghost btn-sm" onClick={() => { const next = lessonPeriods.map((p) => p.id); setDutyPeriods(next); setSetting('duty_periods', JSON.stringify(next)); }}>
                الحصص فقط
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => { setDutyPeriods([]); setSetting('duty_periods', '[]'); }}>
                مسح
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {allPeriods.map((p) => (
            <button key={p.id} type="button" onClick={() => togglePeriod(p.id)} disabled={!canEdit}
              className={cn('btn-ghost btn-sm', dutyPeriods.includes(p.id) && 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200')}>
              {p.name}
              {p.kind === 'break' ? <span className="text-[10px] opacity-60">فسحة</span> : null}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">يمكن اختيار الفسحات والحصة الأولى. عند عدم اختيار أي فترة تُستخدم كل حصص الدروس.</p>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-32 rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">الموقع</th>
              {days.map((d) => <th key={d.id} className="rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">{d.name}</th>)}
              {canEdit ? <th className="w-10 bg-transparent" /> : null}
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <tr key={area.id}>
                <td className="rounded-xl bg-slate-50 p-2 text-center text-xs font-bold dark:bg-slate-900">{area.name}</td>
                {days.map((d) => (
                  <td key={d.id} className="rounded-xl border border-slate-200 p-1 align-top dark:border-slate-800">
                    <div className="space-y-1">
                      {shownPeriods.map((p) => {
                        const duty = byCell.get(`${area.id}-${d.id}-${p.id}`);
                        const teacher = db.teachers.find((t) => t.id === duty?.teacher_id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={!canEdit || !duty}
                            onClick={() => duty && setCell({ duty, teacherId: duty.teacher_id || '' })}
                            className={cn(
                              'flex w-full items-center justify-between gap-1 rounded-lg px-1.5 py-1 text-[10px]',
                              teacher ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100' : 'bg-slate-50 text-slate-400 dark:bg-slate-900',
                            )}
                          >
                            <span className="truncate">{teacher ? teacher.name.split(' ')[0] : 'شاغر'}</span>
                            <span className="shrink-0 opacity-60">{p.idx}</span>
                          </button>
                        );
                      })}
                    </div>
                  </td>
                ))}
                {canEdit ? (
                  <td>
                    <div className="flex flex-col gap-1">
                      <button className="btn-ghost btn-sm" onClick={() => { setEditingArea(area.id); setAreaForm({ ...area }); setAreaOpen(true); }}><Pencil size={12} /></button>
                      <button className="btn-ghost btn-sm text-rose-600" onClick={() => { if (confirm('حذف الموقع؟')) { try { deleteEntity('supervision_areas', area.id); toast('ok', 'تم الحذف'); } catch (e: any) { toast('err', e.message); } } }}><Trash2 size={12} /></button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!areas.length ? <p className="py-8 text-center text-sm text-slate-400">أضف موقع إشراف واحدًا على الأقل.</p> : null}
      </Card>

      {result ? (
        <Card className="mt-4">
          <h2 className="mb-2 font-extrabold">نتيجة التوليد</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="green">مناوبات: {result.duties.length}</Badge>
            <Badge tone={result.vacant ? 'rose' : 'green'}>شاغرة: {result.vacant}</Badge>
            <Badge tone={result.clashes ? 'rose' : 'green'}>تعارض حصص: {result.clashes}</Badge>
            <Badge tone="brand">عدالة: فرق أقصى {result.fairness.length ? result.fairness[0].count - result.fairness[result.fairness.length - 1].count : 0}</Badge>
          </div>
        </Card>
      ) : null}

      <Modal open={areaOpen} onClose={() => setAreaOpen(false)} title={editingArea ? 'تعديل موقع' : 'إضافة موقع إشراف'}
        footer={<><button className="btn-ghost" onClick={() => setAreaOpen(false)}>إلغاء</button><button className="btn-primary" form="area-form">حفظ</button></>}>
        <form id="area-form" onSubmit={saveArea} className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم الموقع"><input className="input" value={areaForm.name} onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })} required /></Field>
          <Field label="النوع">
            <select className="input" value={areaForm.kind} onChange={(e) => setAreaForm({ ...areaForm, kind: e.target.value })}>
              <option value="corridor">ممر</option><option value="yard">ساحة</option><option value="gate">بوابة</option>
              <option value="floor">دور</option><option value="building">مبنى</option><option value="other">أخرى</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={areaForm.active !== 0} onChange={(e) => setAreaForm({ ...areaForm, active: e.target.checked ? 1 : 0 })} /> نشط</label>
        </form>
      </Modal>

      <Modal open={!!cell} onClose={() => setCell(null)} title="تعديل مناوبة"
        footer={<><button className="btn-ghost" onClick={() => setCell(null)}>إلغاء</button><button className="btn-primary" form="duty-form">حفظ</button></>}>
        <form id="duty-form" onSubmit={saveDuty}>
          <Field label="المعلم المناوب" hint="تُمنع المناوبة المتعارضة مع حصة في نفس الوقت.">
            <select className="input" value={cell?.teacherId || ''} onChange={(e) => setCell({ ...cell, teacherId: e.target.value })}>
              <option value="">— شاغر —</option>
              {db.teachers.filter((t) => t.active !== 0).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
