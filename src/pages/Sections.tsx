import { useMemo, useState } from 'react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, DataTable, Field, Modal, PageHeader, cn } from '../components/ui';

type Tab = 'sections' | 'grades' | 'rooms' | 'assignments';

export default function Sections() {
  const { db, saveEntity, deleteEntity, saveAssignment, deleteAssignment, toast } = useApp();
  const canEdit = usePerm('sections', 'edit');
  const [tab, setTab] = useState<Tab>('sections');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState<number | null>(null);

  const gradeName = (id: number) => db.grades.find((g) => g.id === id)?.name || '';
  const roomName = (id?: number | null) => db.rooms.find((r) => r.id === id)?.name || '—';
  const subjectName = (id: number) => db.subjects.find((s) => s.id === id)?.name || '';
  const teacherName = (id?: number | null) => db.teachers.find((t) => t.id === id)?.name || '—';

  const loadByTeacher = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of db.assignments) {
      if (a.teacher_id) map.set(a.teacher_id, (map.get(a.teacher_id) || 0) + a.weekly_periods);
    }
    return map;
  }, [db.assignments]);

  function start(kind: Tab, row?: any) {
    setEditing(row?.id ?? null);
    if (kind === 'sections') setForm(row ? { ...row } : { grade_id: db.grades[0]?.id, name: '', room_id: db.rooms[0]?.id, students: 30, active: 1 });
    if (kind === 'grades') setForm(row ? { ...row } : { name: '', stage: db.school.stage, ord: db.grades.length + 1 });
    if (kind === 'rooms') setForm(row ? { ...row } : { name: '', kind: 'class', capacity: 30, building: '', floor: '' });
    if (kind === 'assignments') setForm(row ? { ...row } : { section_id: db.sections[0]?.id, subject_id: db.subjects[0]?.id, teacher_id: db.teachers[0]?.id, weekly_periods: 1, room_id: null });
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (tab === 'assignments') {
        saveAssignment({
          ...form,
          weekly_periods: Number(form.weekly_periods),
          teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
          room_id: form.room_id ? Number(form.room_id) : null,
          section_id: Number(form.section_id),
          subject_id: Number(form.subject_id),
        }, editing);
        toast('ok', 'تم حفظ الإسناد');
      } else {
        const key = tab === 'sections' ? 'sections' : tab === 'grades' ? 'grades' : 'rooms';
        const values = { ...form };
        if (tab === 'sections') { values.grade_id = Number(values.grade_id); values.room_id = values.room_id ? Number(values.room_id) : null; values.students = Number(values.students); values.active = values.active ? 1 : 0; }
        if (tab === 'rooms') { values.capacity = Number(values.capacity); }
        saveEntity(key, values, editing);
        toast('ok', 'تم الحفظ');
      }
      setOpen(false);
    } catch (err: any) { toast('err', err.message); }
  }

  function remove(kind: Tab, row: any) {
    if (!confirm('حذف السجل المحدد؟')) return;
    try {
      if (kind === 'assignments') deleteAssignment(row.id);
      else deleteEntity(kind === 'sections' ? 'sections' : kind === 'grades' ? 'grades' : 'rooms', row.id);
      toast('ok', 'تم الحذف');
    } catch (err: any) { toast('err', err.message); }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sections', label: 'الشعب' },
    { key: 'grades', label: 'الصفوف' },
    { key: 'rooms', label: 'القاعات' },
    { key: 'assignments', label: 'إسناد المواد' },
  ];

  return (
    <div>
      <PageHeader
        icon={Layers}
        title="الصفوف والشعب والقاعات"
        subtitle="البيانات الأساسية وإسناد المواد للمعلمين"
        actions={canEdit ? <button className="btn-primary" onClick={() => start(tab)}><Plus size={16} /> إضافة</button> : null}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('btn-ghost btn-sm', tab === t.key && 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sections' ? (
        <DataTable
          rows={db.sections}
          searchKeys={['name']}
          columns={[
            { key: 'grade', label: 'الصف', render: (r: any) => gradeName(r.grade_id) },
            { key: 'name', label: 'الشعبة', render: (r: any) => <span className="font-semibold">{r.name}</span> },
            { key: 'room', label: 'القاعة', render: (r: any) => roomName(r.room_id) },
            { key: 'students', label: 'الطلاب' },
            { key: 'assignments', label: 'الإسنادات', render: (r: any) => db.assignments.filter((a) => a.section_id === r.id).length },
            { key: 'active', label: 'الحالة', render: (r: any) => <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'نشطة' : 'موقوفة'}</Badge> },
          ]}
          actions={(r: any) => (
            <div className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => start('sections', r)} disabled={!canEdit}><Pencil size={14} /></button>
              <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove('sections', r)} disabled={!canEdit}><Trash2 size={14} /></button>
            </div>
          )}
        />
      ) : null}

      {tab === 'grades' ? (
        <DataTable
          rows={db.grades}
          columns={[
            { key: 'name', label: 'الصف' },
            { key: 'stage', label: 'المرحلة' },
            { key: 'ord', label: 'الترتيب' },
            { key: 'sections', label: 'عدد الشعب', render: (r: any) => db.sections.filter((s) => s.grade_id === r.id).length },
          ]}
          actions={(r: any) => (
            <div className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => start('grades', r)} disabled={!canEdit}><Pencil size={14} /></button>
              <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove('grades', r)} disabled={!canEdit}><Trash2 size={14} /></button>
            </div>
          )}
        />
      ) : null}

      {tab === 'rooms' ? (
        <DataTable
          rows={db.rooms}
          searchKeys={['name', 'kind']}
          columns={[
            { key: 'name', label: 'القاعة' },
            { key: 'kind', label: 'النوع', render: (r: any) => ({ class: 'فصل', lab: 'معمل', computer: 'حاسب', art: 'فني', sports: 'رياضة', other: 'أخرى' } as any)[r.kind] || r.kind },
            { key: 'capacity', label: 'السعة' },
            { key: 'building', label: 'المبنى' },
            { key: 'lessons', label: 'الحصص', render: (r: any) => db.lessons.filter((l) => l.room_id === r.id).length },
          ]}
          actions={(r: any) => (
            <div className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => start('rooms', r)} disabled={!canEdit}><Pencil size={14} /></button>
              <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove('rooms', r)} disabled={!canEdit}><Trash2 size={14} /></button>
            </div>
          )}
        />
      ) : null}

      {tab === 'assignments' ? (
        <DataTable
          rows={db.assignments}
          pageSize={15}
          columns={[
            { key: 'section', label: 'الشعبة', render: (r: any) => `${gradeName(db.sections.find((s) => s.id === r.section_id)?.grade_id || 0)} — ${db.sections.find((s) => s.id === r.section_id)?.name || ''}` },
            { key: 'subject', label: 'المادة', render: (r: any) => subjectName(r.subject_id) },
            { key: 'teacher', label: 'المعلم', render: (r: any) => teacherName(r.teacher_id) },
            { key: 'weekly', label: 'حصص أسبوعية', render: (r: any) => r.weekly_periods },
            { key: 'room', label: 'القاعة', render: (r: any) => roomName(r.room_id) },
            {
              key: 'load', label: 'نصاب المعلم',
              render: (r: any) => {
                const t = db.teachers.find((x) => x.id === r.teacher_id);
                if (!t) return <Badge tone="rose">بلا معلم</Badge>;
                const n = loadByTeacher.get(t.id) || 0;
                return <Badge tone={n > t.weekly_load ? 'rose' : 'green'}>{n} / {t.weekly_load}</Badge>;
              },
            },
          ]}
          actions={(r: any) => (
            <div className="flex gap-1">
              <button className="btn-ghost btn-sm" onClick={() => start('assignments', r)} disabled={!canEdit}><Pencil size={14} /></button>
              <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove('assignments', r)} disabled={!canEdit}><Trash2 size={14} /></button>
            </div>
          )}
        />
      ) : null}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={`${editing ? 'تعديل' : 'إضافة'} ${{ sections: 'شعبة', grades: 'صف', rooms: 'قاعة', assignments: 'إسناد' }[tab]}`}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn-primary" form="section-form">حفظ</button></>}
      >
        <form id="section-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {tab === 'sections' ? <>
            <Field label="الصف">
              <select className="input" value={form.grade_id || ''} onChange={(e) => setForm({ ...form, grade_id: e.target.value })}>
                {db.grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="اسم الشعبة"><input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="القاعة">
              <select className="input" value={form.room_id || ''} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
                <option value="">بدون</option>
                {db.rooms.filter((r) => r.kind === 'class').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="عدد الطلاب"><input className="input" type="number" min={0} value={form.students || 0} onChange={(e) => setForm({ ...form, students: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active !== 0} onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} /> نشطة</label>
          </> : null}

          {tab === 'grades' ? <>
            <Field label="اسم الصف"><input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="المرحلة">
              <select className="input" value={form.stage || 'متوسط'} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {['ابتدائي', 'متوسط', 'ثانوي'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="الترتيب"><input className="input" type="number" value={form.ord || 1} onChange={(e) => setForm({ ...form, ord: Number(e.target.value) })} /></Field>
          </> : null}

          {tab === 'rooms' ? <>
            <Field label="اسم القاعة"><input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="النوع">
              <select className="input" value={form.kind || 'class'} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="class">فصل</option><option value="lab">معمل علوم</option><option value="computer">معمل حاسب</option>
                <option value="art">فني</option><option value="sports">رياضة</option><option value="other">أخرى</option>
              </select>
            </Field>
            <Field label="السعة"><input className="input" type="number" value={form.capacity || 30} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
            <Field label="المبنى"><input className="input" value={form.building || ''} onChange={(e) => setForm({ ...form, building: e.target.value })} /></Field>
          </> : null}

          {tab === 'assignments' ? <>
            <Field label="الشعبة">
              <select className="input" value={form.section_id || ''} onChange={(e) => setForm({ ...form, section_id: e.target.value })}>
                {db.sections.map((s) => <option key={s.id} value={s.id}>{gradeName(s.grade_id)} — {s.name}</option>)}
              </select>
            </Field>
            <Field label="المادة">
              <select className="input" value={form.subject_id || ''} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="المعلم" hint={form.teacher_id ? `المُسند حاليًا: ${loadByTeacher.get(Number(form.teacher_id)) || 0} حصة` : ''}>
              <select className="input" value={form.teacher_id || ''} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
                <option value="">بلا معلم</option>
                {db.teachers.filter((t) => t.active !== 0).map((t) => <option key={t.id} value={t.id}>{t.name} — {t.specialty}</option>)}
              </select>
            </Field>
            <Field label="عدد الحصص الأسبوعية"><input className="input" type="number" min={0} max={20} value={form.weekly_periods || 1} onChange={(e) => setForm({ ...form, weekly_periods: e.target.value })} /></Field>
            <Field label="قاعة خاصة">
              <select className="input" value={form.room_id || ''} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
                <option value="">قاعة الشعبة</option>
                {db.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </> : null}
        </form>
      </Modal>
    </div>
  );
}
