import { useMemo, useState } from 'react';
import { CalendarOff, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, DataTable, Field, Modal, PageHeader, cn } from '../components/ui';

const EMPTY = { name: '', employee_no: '', specialty: '', weekly_load: 20, max_daily: 6, phone: '', email: '', notes: '', active: 1 };

export default function Teachers() {
  const { db, saveEntity, deleteEntity, setTeacherUnavailable, toast } = useApp();
  const canEdit = usePerm('teachers', 'edit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [availOpen, setAvailOpen] = useState(false);
  const [availTeacher, setAvailTeacher] = useState<any>(null);
  const [slots, setSlots] = useState<string[]>([]);

  const days = useMemo(() => db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx), [db.days]);
  const periods = useMemo(() => db.periods.filter((p) => p.active !== 0 && (p.kind || 'lesson') === 'lesson')
    .sort((a, b) => a.idx - b.idx), [db.periods]);
  const unavailableCount = (id: number) => db.teacher_unavailable.filter((u) => u.teacher_id === id).length;

  function openAvailability(row: any) {
    setAvailTeacher(row);
    setSlots(db.teacher_unavailable.filter((u) => u.teacher_id === row.id).map((u) => `${u.day_id}-${u.period_id}`));
    setAvailOpen(true);
  }

  function toggleSlot(dayId: number, periodId: number) {
    const key = `${dayId}-${periodId}`;
    setSlots((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  function toggleDay(dayId: number) {
    const keys = periods.map((p) => `${dayId}-${p.id}`);
    const all = keys.every((k) => slots.includes(k));
    setSlots((prev) => (all ? prev.filter((k) => !keys.includes(k)) : [...new Set([...prev, ...keys])]));
  }

  function saveAvailability() {
    try {
      const parsed = slots.map((s) => s.split('-').map(Number) as [number, number]);
      setTeacherUnavailable(availTeacher.id, parsed);
      toast('ok', `حُفظت أوقات عدم توفر ${availTeacher.name}`);
      setAvailOpen(false);
    } catch (err: any) { toast('err', err.message); }
  }

  function start(row?: any) {
    setEditing(row?.id ?? null);
    setForm(row ? { ...row } : { ...EMPTY });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      saveEntity('teachers', {
        ...form,
        weekly_load: Number(form.weekly_load),
        max_daily: Number(form.max_daily),
        active: form.active ? 1 : 0,
      }, editing);
      toast('ok', editing ? 'تم تحديث المعلم' : 'تمت إضافة المعلم');
      setOpen(false);
    } catch (err: any) {
      toast('err', err.message);
    }
  }

  function remove(row: any) {
    if (!confirm(`حذف المعلم «${row.name}»؟`)) return;
    try {
      deleteEntity('teachers', row.id);
      toast('ok', 'تم حذف المعلم');
    } catch (err: any) {
      toast('err', err.message);
    }
  }

  const load = (id: number) => db.assignments.filter((a) => a.teacher_id === id).reduce((s, a) => s + a.weekly_periods, 0);

  return (
    <div>
      <PageHeader
        icon={Users}
        title="المعلمون"
        subtitle={`${db.teachers.length} معلمًا — النصاب والحد اليومي والتخصص`}
        actions={canEdit ? <button className="btn-primary" onClick={() => start()}><Plus size={16} /> معلم جديد</button> : null}
      />

      <DataTable
        rows={db.teachers}
        searchKeys={['name', 'employee_no', 'specialty']}
        pageSize={12}
        columns={[
          { key: 'name', label: 'المعلم', render: (r: any) => <span className="font-semibold">{r.name}</span> },
          { key: 'employee_no', label: 'الرقم الوظيفي' },
          { key: 'specialty', label: 'التخصص' },
          { key: 'weekly_load', label: 'النصاب', render: (r: any) => <span>{r.weekly_load}</span> },
          {
            key: 'assigned',
            label: 'المُسند',
            render: (r: any) => {
              const n = load(r.id);
              return <Badge tone={n > r.weekly_load ? 'rose' : n === r.weekly_load ? 'green' : 'amber'}>{n} / {r.weekly_load}</Badge>;
            },
          },
          { key: 'max_daily', label: 'الحد اليومي' },
          {
            key: 'unavailable',
            label: 'عدم التوفر',
            render: (r: any) => {
              const n = unavailableCount(r.id);
              return <Badge tone={n ? 'amber' : 'slate'}>{n ? `${n} خانة` : 'لا شيء'}</Badge>;
            },
          },
          { key: 'active', label: 'الحالة', render: (r: any) => <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'نشط' : 'موقوف'}</Badge> },
        ]}
        actions={(r: any) => (
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={() => openAvailability(r)} disabled={!canEdit} title="أوقات عدم التوفر"><CalendarOff size={14} /></button>
            <button className="btn-ghost btn-sm" onClick={() => start(r)} disabled={!canEdit} aria-label="تعديل"><Pencil size={14} /></button>
            <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(r)} disabled={!canEdit} aria-label="حذف"><Trash2 size={14} /></button>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'تعديل معلم' : 'إضافة معلم'}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn-primary" form="teacher-form">حفظ</button></>}
      >
        <form id="teacher-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم المعلم"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="الرقم الوظيفي"><input className="input" value={form.employee_no} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} /></Field>
          <Field label="التخصص"><input className="input" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></Field>
          <Field label="النصاب الأسبوعي"><input className="input" type="number" min={0} max={40} value={form.weekly_load} onChange={(e) => setForm({ ...form, weekly_load: e.target.value })} /></Field>
          <Field label="الحد اليومي"><input className="input" type="number" min={1} max={10} value={form.max_daily} onChange={(e) => setForm({ ...form, max_daily: e.target.value })} /></Field>
          <Field label="الجوال"><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="البريد"><input className="input" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <label className="mt-5 flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} /> نشط
          </label>
          <div className="sm:col-span-2">
            <Field label="ملاحظات"><textarea className="input min-h-20" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={availOpen}
        onClose={() => setAvailOpen(false)}
        title={`أوقات عدم توفر ${availTeacher?.name || ''}`}
        wide
        footer={(
          <>
            <button className="btn-ghost" onClick={() => setSlots([])}>مسح كل الخانات</button>
            <button className="btn-ghost" onClick={() => setAvailOpen(false)}>إلغاء</button>
            <button className="btn-primary" onClick={saveAvailability}>حفظ</button>
          </>
        )}
      >
        <p className="mb-3 text-xs leading-5 text-slate-500">
          علّم الخانات التي لا يستطيع المعلم العمل فيها (اجتماعات، تكليفات، ظروف صحية). تُستخدم في كشف التعارضات
          والمحرك وتوزيع الاختبارات والانتظار. انقر اسم اليوم لتبديل اليوم كاملًا.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="border border-slate-200 p-2 text-right dark:border-slate-800">الحصة</th>
                {days.map((d) => (
                  <th key={d.id} className="border border-slate-200 p-1 dark:border-slate-800">
                    <button type="button" className="font-bold hover:text-brand-700" onClick={() => toggleDay(d.id)}>{d.name}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <th className="border border-slate-200 p-2 text-right text-[11px] dark:border-slate-800">{p.name}</th>
                  {days.map((d) => {
                    const key = `${d.id}-${p.id}`;
                    const on = slots.includes(key);
                    return (
                      <td key={d.id} className="border border-slate-200 p-1 text-center dark:border-slate-800">
                        <button type="button" onClick={() => toggleSlot(d.id, p.id)}
                          className={cn('mx-auto grid h-8 w-8 place-items-center rounded-lg border text-[10px] font-bold transition',
                            on ? 'border-rose-500 bg-rose-500 text-white' : 'border-slate-200 text-slate-300 hover:border-rose-300 dark:border-slate-700')}
                          aria-label={`${d.name} ${p.name}`} aria-pressed={on}>
                          {on ? '✕' : '○'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
          <Badge tone={slots.length ? 'amber' : 'green'}>{slots.length} خانة محددة</Badge>
          <span>المعلم متاح افتراضيًا في كل الخانات غير المعلّمة.</span>
        </div>
      </Modal>
    </div>
  );
}
