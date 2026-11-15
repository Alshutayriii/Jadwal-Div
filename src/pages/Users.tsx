import { useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, DataTable, Field, Modal, PageHeader } from '../components/ui';

const ROLES = [
  { value: 'system_admin', label: 'مدير النظام' }, { value: 'principal', label: 'مدير المدرسة' },
  { value: 'vice', label: 'وكيل المدرسة' }, { value: 'scheduler', label: 'مسؤول الجدول' },
  { value: 'teacher', label: 'معلم' },
];
const LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

export default function Users() {
  const { db, session, saveEntity, deleteEntity, setPassword, toast } = useApp();
  const canEdit = usePerm('users', 'edit');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name: '', username: '', role: 'teacher', teacher_id: '', active: 1, password: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<any>(null);
  const [pw, setPw] = useState('');

  function start(row?: any) {
    setEditing(row?.id ?? null);
    setForm(row ? { ...row, password: '' } : { name: '', username: '', role: 'teacher', teacher_id: '', active: 1, password: '' });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!editing && String(form.password).length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      const saved = saveEntity('users', {
        name: form.name, username: form.username, role: form.role,
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null, active: form.active ? 1 : 0,
      }, editing);
      if (!editing && form.password) await setPassword(saved.id, form.password);
      toast('ok', 'تم حفظ المستخدم');
      setOpen(false);
    } catch (err: any) { toast('err', err.message); }
  }

  function remove(row: any) {
    if (!confirm(`حذف المستخدم «${row.username}»؟`)) return;
    try { deleteEntity('users', row.id); toast('ok', 'تم حذف المستخدم'); }
    catch (err: any) { toast('err', err.message); }
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    try {
      await setPassword(pwUser.id, pw);
      toast('ok', 'تم تغيير كلمة المرور');
      setPwOpen(false); setPw('');
    } catch (err: any) { toast('err', err.message); }
  }

  return (
    <div>
      <PageHeader
        icon={UserCog}
        title="المستخدمون والصلاحيات"
        subtitle="أدوار محلية، كلمات مرور مجزأة بـ PBKDF2"
        actions={canEdit ? <button className="btn-primary" onClick={() => start()}><Plus size={16} /> مستخدم جديد</button> : null}
      />

      <DataTable
        rows={db.users}
        searchKeys={['name', 'username', 'role']}
        columns={[
          { key: 'name', label: 'الاسم', render: (r: any) => <span className="font-semibold">{r.name} {session?.user.id === r.id ? <Badge tone="brand">أنت</Badge> : null}</span> },
          { key: 'username', label: 'اسم المستخدم' },
          { key: 'role', label: 'الدور', render: (r: any) => <Badge tone="teal">{LABEL[r.role] || r.role}</Badge> },
          { key: 'teacher_id', label: 'المعلم المرتبط', render: (r: any) => db.teachers.find((t) => t.id === r.teacher_id)?.name || '—' },
          { key: 'active', label: 'الحالة', render: (r: any) => <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'نشط' : 'موقوف'}</Badge> },
          { key: 'hash', label: 'كلمة المرور', render: (r: any) => <span className="text-[10px] text-slate-400">{r.password_hash ? 'مُجزّأة ✓' : 'غير مهيأة'}</span> },
        ]}
        actions={(r: any) => (
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={() => { setPwUser(r); setPw(''); setPwOpen(true); }} disabled={!canEdit} title="كلمة المرور"><KeyRound size={14} /></button>
            <button className="btn-ghost btn-sm" onClick={() => start(r)} disabled={!canEdit}><Pencil size={14} /></button>
            <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(r)} disabled={!canEdit || r.id === session?.user.id}><Trash2 size={14} /></button>
          </div>
        )}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'تعديل مستخدم' : 'إضافة مستخدم'}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn-primary" form="user-form">حفظ</button></>}>
        <form id="user-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="اسم المستخدم"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
          <Field label="الدور">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="المعلم المرتبط (للمعلم فقط)">
            <select className="input" value={form.teacher_id || ''} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">—</option>
              {db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          {!editing ? <div className="sm:col-span-2"><Field label="كلمة المرور" hint="تُجزّأ محليًا ولا تُخزّن نصًا صريحًا."><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required /></Field></div> : null}
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active !== 0} onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} /> نشط</label>
        </form>
      </Modal>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={`كلمة مرور ${pwUser?.name || ''}`}
        footer={<><button className="btn-ghost" onClick={() => setPwOpen(false)}>إلغاء</button><button className="btn-primary" form="pw-form">تغيير</button></>}>
        <form id="pw-form" onSubmit={savePw}>
          <Field label="كلمة المرور الجديدة" hint="6 أحرف على الأقل. استخدم كلمة قوية قبل التشغيل الحقيقي.">
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required autoFocus />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
