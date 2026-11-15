import { useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, DataTable, Field, Modal, PageHeader } from '../components/ui';

const EMPTY = { name: '', employee_no: '', specialty: '', weekly_load: 20, max_daily: 6, phone: '', email: '', notes: '', active: 1 };

export default function Teachers() {
  const { db, saveEntity, deleteEntity, toast } = useApp();
  const canEdit = usePerm('teachers', 'edit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);

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
          { key: 'active', label: 'الحالة', render: (r: any) => <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'نشط' : 'موقوف'}</Badge> },
        ]}
        actions={(r: any) => (
          <div className="flex gap-1">
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
    </div>
  );
}
