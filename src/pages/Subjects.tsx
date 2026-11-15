import { useState } from 'react';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, DataTable, Field, Modal, PageHeader } from '../components/ui';

const EMPTY = { name: '', stage: 'متوسط', weekly_periods: 2, max_per_day: 1, color: '#6366f1', needs_lab: 0, consecutive: 0, active: 1 };

export default function Subjects() {
  const { db, saveEntity, deleteEntity, toast } = useApp();
  const canEdit = usePerm('subjects', 'edit');
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
      saveEntity('subjects', {
        ...form,
        weekly_periods: Number(form.weekly_periods),
        max_per_day: Number(form.max_per_day),
        needs_lab: form.needs_lab ? 1 : 0,
        consecutive: form.consecutive ? 1 : 0,
        active: form.active ? 1 : 0,
      }, editing);
      toast('ok', 'تم حفظ المادة');
      setOpen(false);
    } catch (err: any) { toast('err', err.message); }
  }

  function remove(row: any) {
    if (!confirm(`حذف المادة «${row.name}»؟`)) return;
    try { deleteEntity('subjects', row.id); toast('ok', 'تم حذف المادة'); }
    catch (err: any) { toast('err', err.message); }
  }

  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="المواد الدراسية"
        subtitle={`${db.subjects.length} مادة — الحد اليومي والمعامل والألوان`}
        actions={canEdit ? <button className="btn-primary" onClick={() => start()}><Plus size={16} /> مادة جديدة</button> : null}
      />

      <DataTable
        rows={db.subjects}
        searchKeys={['name', 'stage']}
        columns={[
          {
            key: 'name', label: 'المادة',
            render: (r: any) => <span className="flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: r.color }} />{r.name}</span>,
          },
          { key: 'stage', label: 'المرحلة' },
          { key: 'weekly_periods', label: 'حصص أسبوعية' },
          { key: 'max_per_day', label: 'حد التكرار اليومي' },
          { key: 'needs_lab', label: 'معمل', render: (r: any) => <Badge tone={r.needs_lab ? 'amber' : 'slate'}>{r.needs_lab ? 'نعم' : 'لا'}</Badge> },
          { key: 'sections', label: 'الشعب', render: (r: any) => db.assignments.filter((a) => a.subject_id === r.id).length },
          { key: 'active', label: 'الحالة', render: (r: any) => <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'نشطة' : 'موقوفة'}</Badge> },
        ]}
        actions={(r: any) => (
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={() => start(r)} disabled={!canEdit}><Pencil size={14} /></button>
            <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(r)} disabled={!canEdit}><Trash2 size={14} /></button>
          </div>
        )}
      />

      <Modal
        open={open} onClose={() => setOpen(false)} title={editing ? 'تعديل مادة' : 'إضافة مادة'}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn-primary" form="subject-form">حفظ</button></>}
      >
        <form id="subject-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="اسم المادة"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field></div>
          <Field label="المرحلة">
            <select className="input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
              {['ابتدائي', 'متوسط', 'ثانوي'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="اللون"><input className="input h-10" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          <Field label="حصص أسبوعية"><input className="input" type="number" min={0} max={20} value={form.weekly_periods} onChange={(e) => setForm({ ...form, weekly_periods: e.target.value })} /></Field>
          <Field label="أقصى تكرار يومي"><input className="input" type="number" min={1} max={4} value={form.max_per_day} onChange={(e) => setForm({ ...form, max_per_day: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!form.needs_lab} onChange={(e) => setForm({ ...form, needs_lab: e.target.checked ? 1 : 0 })} /> تتطلب معملًا</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} /> نشطة</label>
        </form>
      </Modal>
    </div>
  );
}
