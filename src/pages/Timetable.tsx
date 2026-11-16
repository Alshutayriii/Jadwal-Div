import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Copy, Download, FileDown, GripVertical, Grid3X3, Info, Loader2, Lock,
  LockOpen, Plus, QrCode, Redo2, Rocket, Share2, Sparkles, Trash2, Undo2,
} from 'lucide-react';
import { buildSectionShare, copyText, downloadDataUrl, qrDataUrl } from '../lib/share';
import { useApp, usePerm } from '../store';
import { activeSchedule, enrich, scheduleLessons } from '../lib/model';
import { detect } from '../lib/conflicts';
import { qualityOf } from '../lib/scheduler.js';
import { Badge, Card, Field, Modal, PageHeader, cn, EmptyState } from '../components/ui';

const TYPE_LABEL: Record<string, string> = {
  teacher_clash: 'تعارض معلم', section_clash: 'تعارض شعبة', room_clash: 'تعارض قاعة',
  unplaced: 'حصص غير موزعة', no_teacher: 'إسناد بلا معلم', teacher_overload: 'تجاوز النصاب',
  teacher_daily: 'تجاوز الحد اليومي', section_daily: 'سقف يوم الشعبة', unqualified: 'معلم غير مؤهل',
  unavailable: 'معلم غير متاح', subject_repeat: 'تكرار مادة', lab_missing: 'معمل ناقص',
  consecutive: 'تجاوز التجاور',
};

interface DragState {
  lesson: any;
  from: { day: number; period: number };
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

interface Preview {
  ok: boolean;
  problems: string[];
  swapWith?: any;
}

export default function Timetable() {
  const {
    db, generateSchedule, publishSchedule, addLesson, updateLesson, deleteLesson, toggleLock,
    validateLesson, moveLesson, undo, redo, history, future, toast,
  } = useApp();
  const canEdit = usePerm('timetable', 'edit');
  const sch = activeSchedule(db);
  const lessons = useMemo(() => (sch ? scheduleLessons(db, sch.id) : []), [db, sch]);
  const days = db.days.filter((d) => d.active !== 0).sort((a, b) => a.idx - b.idx);
  const periods = db.periods.filter((p) => p.active !== 0 && p.kind !== 'break').sort((a, b) => a.idx - b.idx);
  const [searchParams] = useSearchParams();
  const [sectionId, setSectionId] = useState<number>(() => {
    const fromUrl = Number(searchParams.get('section'));
    return db.sections.some((s) => s.id === fromUrl) ? fromUrl : (db.sections[0]?.id || 0);
  });
  useEffect(() => {
    const fromUrl = Number(searchParams.get('section'));
    if (fromUrl && db.sections.some((s) => s.id === fromUrl)) setSectionId(fromUrl);
  }, [searchParams, db.sections]);
  const section = db.sections.find((s) => s.id === sectionId);
  const sectionLessons = lessons.filter((l) => l.section_id === sectionId);
  const ctx = useMemo(() => enrich(db), [db]);
  const conflicts = useMemo(() => detect({ ...ctx, lessons, school: db.school }), [ctx, lessons, db.school]);
  const [genOpen, setGenOpen] = useState(false);
  const [seed, setSeed] = useState(42);
  const [genResult, setGenResult] = useState<any>(null);
  const [cell, setCell] = useState<{ day: number; period: number; lesson?: any } | null>(null);
  const [form, setForm] = useState<any>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [share, setShare] = useState<any>(null);
  const [qr, setQr] = useState<string>('');
  const [qrError, setQrError] = useState('');
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ day: number; period: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const quality = useMemo(() => qualityOf(lessons, {
    ...ctx,
    periodOrder: new Map(db.periods.map((p, i) => [p.id, i])),
  }), [lessons, ctx, db.periods]);

  const sectionAssignments = db.assignments.filter((a) => a.section_id === sectionId);
  const cellFor = (day: number, period: number) => sectionLessons.find((l) => l.day_id === day && l.period_id === period);

  // معرّفات الحصص المتورطة في تعارض صارم داخل الجدول كله (لتمييزها بصريًا).
  const clashIds = useMemo(() => {
    const ids = new Set<number>();
    const maps: Array<Map<string, any[]>> = [new Map(), new Map(), new Map()];
    const keys = ['teacher_id', 'section_id', 'room_id'];
    for (const l of lessons) {
      keys.forEach((k, i) => {
        const v = (l as any)[k];
        if (!v) return;
        const key = `${v}|${l.day_id}|${l.period_id}`;
        const map = maps[i];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(l);
      });
    }
    for (const map of maps) {
      for (const group of map.values()) if (group.length > 1) group.forEach((l) => ids.add(l.id));
    }
    return ids;
  }, [lessons]);

  /** معاينة أثر الإفلات: نقل بسيط أو تبديل، مع كل أسباب الرفض. */
  const previewFor = useCallback((day: number, period: number, lesson: any, from: { day: number; period: number }): Preview => {
    const target = sectionLessons.find((l) => l.day_id === day && l.period_id === period);
    if (target && target.id === lesson.id) return { ok: true, problems: [] };
    const ignore = target ? [lesson.id, target.id] : [lesson.id];
    const a = validateLesson({ ...lesson, day_id: day, period_id: period }, ignore);
    const b = target
      ? validateLesson({ ...target, day_id: from.day, period_id: from.period }, ignore)
      : { ok: true, problems: [] as string[] };
    const problems = [...new Set([...a.problems, ...b.problems])];
    return { ok: problems.length === 0, problems, swapWith: target };
  }, [sectionLessons, validateLesson]);

  const preview = useMemo<Preview | null>(() => {
    if (!drag?.active || !hover || !drag.lesson) return null;
    return previewFor(hover.day, hover.period, drag.lesson, drag.from);
  }, [drag, hover, previewFor]);

  const finishDrag = useCallback((clientX: number, clientY: number) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    setHover(null);
    if (!current) return;
    if (!current.active) {
      // نقرة عادية: افتح محرّر الحصة.
      setForm({ ...current.lesson });
      setCell({ day: current.from.day, period: current.from.period, lesson: current.lesson });
      return;
    }
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const slot = el?.closest('[data-day][data-period]') as HTMLElement | null;
    if (!slot) return;
    const day = Number(slot.dataset.day);
    const period = Number(slot.dataset.period);
    if (day === current.from.day && period === current.from.period) return;
    const target = lessons.find((l) => l.section_id === sectionId && l.day_id === day && l.period_id === period);
    if (target && target.id === current.lesson.id) return;
    const check = previewFor(day, period, current.lesson, current.from);
    if (!check.ok) {
      toast('err', check.problems[0] || 'لا يمكن النقل: الخانة غير مناسبة.');
      return;
    }
    try {
      const res = moveLesson(current.lesson.id, day, period);
      if (!res.ok) { toast('err', res.problems[0] || 'تعذّر النقل.'); return; }
      toast('ok', res.swap ? 'تم تبديل الحصتين' : 'تم نقل الحصة');
    } catch (err: any) { toast('err', err.message); }
  }, [lessons, sectionId, previewFor, moveLesson, toast]);

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const dist = Math.hypot(e.clientX - current.startX, e.clientY - current.startY);
      const active = current.active || dist > 6;
      dragRef.current = { ...current, active, x: e.clientX, y: e.clientY };
      setDrag((prev) => (prev ? { ...prev, active, x: e.clientX, y: e.clientY } : prev));
      if (!active) return;
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const slot = el?.closest('[data-day][data-period]') as HTMLElement | null;
      if (slot) {
        const day = Number(slot.dataset.day);
        const period = Number(slot.dataset.period);
        setHover((prev) => (prev && prev.day === day && prev.period === period ? prev : { day, period }));
      } else {
        setHover(null);
      }
    }
    function onUp(e: PointerEvent) {
      finishDrag(e.clientX, e.clientY);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag !== null, finishDrag]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (typing || !canEdit) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const label = e.shiftKey ? redo() : undo();
        if (label) toast('info', `${e.shiftKey ? 'إعادة' : 'تراجع'}: ${label}`);
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        const label = redo();
        if (label) toast('info', `إعادة: ${label}`);
      } else if (e.key === 'Escape' && dragRef.current) {
        dragRef.current = null;
        setDrag(null);
        setHover(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, undo, redo, toast]);

  function startDrag(e: React.PointerEvent, day: number, period: number, lesson: any) {
    if (!canEdit || e.button !== 0) return;
    const state: DragState = {
      lesson, from: { day, period }, startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY, active: false,
    };
    dragRef.current = state;
    setDrag(state);
  }

  function openCell(day: number, period: number) {
    const lesson = cellFor(day, period);
    if (!canEdit) return;
    if (lesson) {
      setForm({ ...lesson });
      setCell({ day, period, lesson });
    } else {
      const a = sectionAssignments[0];
      setForm({
        assignment_id: a?.id || null, section_id: sectionId, subject_id: a?.subject_id || db.subjects[0]?.id,
        teacher_id: a?.teacher_id || null, room_id: a?.room_id || section?.room_id || null, day_id: day, period_id: period,
      });
      setCell({ day, period });
    }
  }

  function saveCell(e: React.FormEvent) {
    e.preventDefault();
    if (!cell) return;
    const candidate = {
      ...form,
      section_id: sectionId,
      day_id: Number(form.day_id),
      period_id: Number(form.period_id),
      teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
      room_id: form.room_id ? Number(form.room_id) : null,
      subject_id: Number(form.subject_id),
      assignment_id: form.assignment_id ? Number(form.assignment_id) : null,
    };
    try {
      const res = cell.lesson ? updateLesson(cell.lesson.id, candidate) : addLesson(candidate);
      if (!res.ok) { toast('err', res.problems.join(' • ')); return; }
      toast('ok', cell.lesson ? 'تم تحديث الحصة' : 'تمت إضافة الحصة');
      setCell(null);
    } catch (err: any) { toast('err', err.message); }
  }

  function doGenerate() {
    try {
      const res = generateSchedule({ seed: Number(seed), timeLimitMs: 7000, maxRestarts: 60 });
      setGenResult(res);
      setGenOpen(false);
      setQualityOpen(true);
      toast(res.unplaced?.length ? 'info' : 'ok', `وُضعت ${res.lessons.length} حصة من ${res.stats?.required ?? '—'}`);
    } catch (err: any) { toast('err', err.message); }
  }

  function doPublish() {
    if (!sch) return;
    if (conflicts.errors) { toast('err', `لا يمكن النشر: ${conflicts.errors} تعارضًا`); return; }
    try {
      publishSchedule(sch.id);
      toast('ok', 'تم نشر الجدول');
    } catch (err: any) { toast('err', err.message); }
  }

  function removeLesson() {
    if (!cell?.lesson || !confirm('حذف هذه الحصة من الجدول؟')) return;
    deleteLesson(cell.lesson.id);
    toast('ok', 'تم حذف الحصة');
    setCell(null);
  }

  async function openShare() {
    setShareBusy(true);
    setShareOpen(true);
    setQr('');
    setQrError('');
    setShare(null);
    try {
      const data = await buildSectionShare(db, sectionId);
      setShare(data);
      try {
        setQr(await qrDataUrl(data.qr));
      } catch {
        // الحزمة أكبر من سعة رمز QR: نُبقي النافذة مفتوحة ونعرض النص والملف بدلًا منه.
        setQrError('حزمة هذه الشعبة أكبر من سعة رمز QR. استخدم «نسخ النص» أو نزّل صورة الجدول.');
      }
    } catch (err: any) {
      setShareOpen(false);
      toast('err', err.message || 'تعذّر تجهيز المشاركة');
    } finally { setShareBusy(false); }
  }

  async function shareNative() {
    if (!share || !navigator.share) return;
    try {
      await navigator.share({ title: share.title, text: share.text });
    } catch { /* ألغى المستخدم */ }
  }

  async function copyShare() {
    if (!share) return;
    const ok = await copyText(share.text);
    toast(ok ? 'ok' : 'err', ok ? 'تم نسخ نص الجدول' : 'تعذّر النسخ');
  }

  async function exportPdf() {
    setPdfBusy(true);
    try {
      const grade = db.grades.find((g) => g.id === section?.grade_id)?.name || '';
      const { exportElementPdf } = await import('../lib/pdf');
      await exportElementPdf(gridRef.current, {
        filename: `جدول-${grade}-شعبة-${section?.name || ''}`,
        title: `جدول الشعبة ${section?.name || ''} — ${grade}`,
        schoolName: db.school.name,
        logo: db.school.logo,
        academicYear: db.school.academic_year,
        term: db.school.term,
        principal: db.school.principal,
        landscape: true,
        note: `${lessons.length} حصة في الجدول · ${sectionLessons.length} حصة لهذه الشعبة`,
      });
      toast('ok', 'تم إنشاء ملف PDF');
    } catch (err: any) { toast('err', err.message || 'تعذّر إنشاء PDF'); }
    finally { setPdfBusy(false); }
  }

  function doUndo() {
    const label = undo();
    toast(label ? 'info' : 'err', label ? `تراجع: ${label}` : 'لا يوجد ما يمكن التراجع عنه.');
  }

  function doRedo() {
    const label = redo();
    toast(label ? 'info' : 'err', label ? `إعادة: ${label}` : 'لا يوجد ما يمكن إعادته.');
  }

  if (!db.sections.length) return <EmptyState title="لا توجد شعب" hint="أضف الصفوف والشعب أولًا." />;

  return (
    <div>
      <PageHeader
        icon={Grid3X3}
        title="الجدول الدراسي"
        subtitle={sch ? `${sch.name} · ${sch.status === 'published' ? 'منشور' : 'مسودة'} · ${lessons.length} حصة` : 'لا يوجد جدول بعد'}
        actions={<>
          <button className="btn-ghost" onClick={openShare} disabled={!sectionLessons.length} title="مشاركة الجدول برمز QR أو نص">
            <QrCode size={16} /> مشاركة
          </button>
          <button className="btn-ghost" onClick={exportPdf} disabled={pdfBusy || !sectionLessons.length}>
            {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} {pdfBusy ? 'جارٍ…' : 'PDF الشعبة'}
          </button>
          {canEdit ? (
          <>
            <div className="flex items-center gap-1">
              <button className="btn-ghost btn-sm" onClick={doUndo} disabled={!history.length} title="تراجع (Ctrl+Z)">
                <Undo2 size={15} /> تراجع
              </button>
              <button className="btn-ghost btn-sm" onClick={doRedo} disabled={!future.length} title="إعادة (Ctrl+Shift+Z)">
                <Redo2 size={15} /> إعادة
              </button>
            </div>
            <button className="btn-ghost" onClick={() => setGenOpen(true)}><Sparkles size={16} /> توليد آلي</button>
            <button className="btn-primary" onClick={doPublish} disabled={!sch || conflicts.errors > 0}><Rocket size={16} /> نشر الجدول</button>
          </>
          ) : null}
        </>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={conflicts.errors ? 'rose' : 'green'}>
          {conflicts.errors ? <><AlertTriangle size={13} className="ml-1" /> {conflicts.errors} خطأ</> : <><CheckCircle2 size={13} className="ml-1" /> بلا تعارض</>}
        </Badge>
        <Badge tone={conflicts.warnings ? 'amber' : 'slate'}>{conflicts.warnings} تنبيه</Badge>
        <Badge tone="brand">{lessons.length} / {db.assignments.reduce((s, a) => s + a.weekly_periods, 0)} حصة</Badge>
        <button type="button" onClick={() => setQualityOpen(true)} title="مؤشرات جودة الجدول">
          <Badge tone={quality.score >= 85 ? 'green' : quality.score >= 70 ? 'teal' : 'amber'}>جودة {quality.score}/100 · {quality.grade}</Badge>
        </button>
        {genResult ? <Badge tone={genResult.unplaced?.length ? 'amber' : 'green'}>{genResult.message || `نتيجة التوليد: ${genResult.lessons.length}`}</Badge> : null}
        <div className="flex-1" />
        <select className="input max-w-xs" value={sectionId} onChange={(e) => setSectionId(Number(e.target.value))}>
          {db.sections.map((s) => {
            const g = db.grades.find((x) => x.id === s.grade_id);
            return <option key={s.id} value={s.id}>{g?.name} — شعبة {s.name}</option>;
          })}
        </select>
      </div>

      <div ref={gridRef}>
      <Card className="overflow-x-auto p-3">
        <table className="w-full min-w-[820px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-28 rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">الحصة / اليوم</th>
              {days.map((d) => <th key={d.id} className="rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800">{d.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="rounded-xl bg-slate-50 p-2 text-center text-[11px] font-bold dark:bg-slate-900">
                  <div>{p.name}</div>
                  <div className="font-normal text-slate-400">{p.start_time}</div>
                </td>
                {days.map((d) => {
                  const l = cellFor(d.id, p.id);
                  const isHover = hover?.day === d.id && hover?.period === p.id;
                  const isDragging = drag?.active && drag.lesson?.id === l?.id;
                  const occupiedTarget = isHover ? cellFor(d.id, p.id) : null;
                  const invalid = isHover && preview && !preview.ok;
                  return (
                    <td key={d.id} className="p-0">
                      <button
                        type="button"
                        data-day={d.id}
                        data-period={p.id}
                        onClick={l ? undefined : () => openCell(d.id, p.id)}
                        onPointerDown={l ? (e) => startDrag(e, d.id, p.id, l) : undefined}
                        className={cn(
                          'relative h-16 w-full touch-manipulation rounded-xl border p-1.5 text-right align-top transition',
                          l
                            ? 'cursor-grab select-none border-transparent text-white shadow-sm active:cursor-grabbing'
                            : 'border-dashed border-slate-200 text-slate-300 hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:bg-slate-800',
                          isDragging && 'opacity-40',
                          isHover && !invalid && 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-slate-900',
                          invalid && 'ring-2 ring-rose-500 ring-offset-1 dark:ring-offset-slate-900',
                          l && clashIds.has(l.id) && 'outline outline-2 outline-offset-2 outline-rose-400',
                        )}
                        style={l ? { background: l.subject_color || '#6366f1' } : undefined}
                        title={l ? 'اسحب لنقل الحصة، أو اضغط للتعديل' : 'خانة فارغة — اضغط لإضافة حصة'}
                      >
                        {l ? (
                          <span className="flex h-full flex-col justify-between">
                            <span className="flex items-start justify-between gap-1">
                              <span className="line-clamp-2 text-[11px] font-extrabold leading-4">{l.subject_name}</span>
                              <span className="flex shrink-0 items-center gap-0.5">
                                {clashIds.has(l.id) ? <AlertTriangle size={11} className="opacity-95" /> : null}
                                {l.locked ? <Lock size={11} className="opacity-80" /> : <GripVertical size={11} className="opacity-50" />}
                              </span>
                            </span>
                            <span className="truncate text-[10px] opacity-90">{l.teacher_name || 'بلا معلم'} · {l.room_name || '—'}</span>
                          </span>
                        ) : <Plus size={16} className="mx-auto" />}
                        {isHover && occupiedTarget && drag?.active ? (
                          <span className="absolute inset-x-1 bottom-1 rounded-md bg-slate-950/70 px-1 py-0.5 text-center text-[9px] font-bold text-white">
                            {preview?.swapWith ? 'تبديل' : 'نقل هنا'}
                          </span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      </div>

      {drag?.active ? (
        <>
          <div
            className="pointer-events-none fixed z-[70] max-w-[180px] rotate-2 rounded-xl px-2 py-1.5 text-[11px] font-extrabold text-white shadow-2xl"
            style={{ left: drag.x + 12, top: drag.y + 12, background: drag.lesson.subject_color || '#6366f1' }}
          >
            {drag.lesson.subject_name}
            <div className="text-[9px] font-normal opacity-90">{drag.lesson.teacher_name || 'بلا معلم'}</div>
          </div>
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] px-3 pb-3">
            <div className={cn('mx-auto max-w-3xl rounded-2xl px-4 py-2.5 text-xs font-bold text-white shadow-xl', preview && !preview.ok ? 'bg-rose-600' : 'bg-slate-900/90')}>
              {!hover ? 'أفلت على خانة في الشبكة' : preview && !preview.ok ? <>⛔ {preview.problems[0]}</> : preview?.swapWith ? `سيتم تبديل الحصة مع: ${preview.swapWith.subject_name}` : 'أفلت لإتمام النقل — ESC للإلغاء'}
            </div>
          </div>
        </>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-extrabold"><AlertTriangle size={17} /> التعارضات</h2>
          {conflicts.conflicts.length ? (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {conflicts.conflicts.map((c: any) => (
                <div key={c.id} className="rounded-xl border border-slate-100 p-2.5 text-xs dark:border-slate-800">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={c.severity === 'error' ? 'rose' : 'amber'}>{TYPE_LABEL[c.type] || c.type}</Badge>
                    <span className="font-bold">{c.entity}</span>
                    <span className="text-slate-400">{c.slot}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">{c.reason}</div>
                  {c.suggestion ? <div className="mt-1 text-emerald-700 dark:text-emerald-300">المقترح: {c.suggestion}</div> : null}
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">الجدول سليم. يمكنك النشر.</p>}
        </Card>

        <Card>
          <h2 className="mb-3 font-extrabold">ملخص الشعبة</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">الحصص الموزعة</div><div className="text-xl font-extrabold">{sectionLessons.length}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">المطلوب</div><div className="text-xl font-extrabold">{sectionAssignments.reduce((s, a) => s + a.weekly_periods, 0)}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">الإسنادات</div><div className="text-xl font-extrabold">{sectionAssignments.length}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><div className="text-xs text-slate-400">حصص مثبتة</div><div className="text-xl font-extrabold">{sectionLessons.filter((l) => l.locked).length}</div></div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[11px] leading-5 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              اضغط أي خانة لإضافة حصة أو تعديلها. اسحب الحصة إلى خانة أخرى لنقلها أو تبديلها، وتظهر حالة الخانة بالأخضر/الأحمر قبل الإفلات.
              كل تعديل قابل للتراجع بـ Ctrl+Z. الحصص المثبتة تبقى في مكانها عند إعادة التوليد.
            </span>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold">جودة الجدول</h2>
            <Badge tone={quality.score >= 85 ? 'green' : quality.score >= 70 ? 'teal' : 'amber'}>{quality.score}/100</Badge>
          </div>
          <div className="space-y-2.5 text-xs">
            {[
              ['التغطية', quality.coverage],
              ['انتشار المواد', quality.spreadRatio],
              ['عدالة الأنصبة', quality.fairness],
              ['توازن الأيام', quality.balance],
            ].map(([label, value]: any) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between"><span className="font-semibold">{label}</span><span className="text-slate-400">{Math.round(value)}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={cn('h-full rounded-full', value >= 85 ? 'bg-emerald-500' : value >= 70 ? 'bg-brand-500' : 'bg-amber-500')} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950"><div className="text-[10px] text-slate-400">فراغات المعلمين</div><div className="text-lg font-extrabold">{quality.teacherGaps}</div></div>
              <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950"><div className="text-[10px] text-slate-400">فراغات الشعب</div><div className="text-lg font-extrabold">{quality.sectionGaps}</div></div>
            </div>
          </div>
        </Card>
      </div>

      {/* مشاركة */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="مشاركة جدول الشعبة"
        footer={<>
          <button className="btn-ghost" onClick={() => setShareOpen(false)}>إغلاق</button>
          <button className="btn-ghost" onClick={copyShare} disabled={!share}><Copy size={15} /> نسخ النص</button>
          {typeof navigator !== 'undefined' && (navigator as any).share ? (
            <button className="btn-ghost" onClick={shareNative} disabled={!share}><Share2 size={15} /> مشاركة النظام</button>
          ) : null}
          <button className="btn-primary" onClick={() => qr && downloadDataUrl(qr, `${share?.fileName || 'جدول'}.png`)} disabled={!qr}><Download size={15} /> تنزيل الرمز</button>
        </>}>
        {shareBusy || !share ? (
          <div className="grid place-items-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="animate-spin" /> جارٍ تجهيز رمز QR…</div>
        ) : (
          <div className="space-y-3">
            <div className="text-center">
              <div className="font-extrabold">{share.title}</div>
              <div className="text-xs text-slate-400">
                {share.cells} حصة · {share.size} بايت
                {share.compressed ? ` · مضغوطة إلى ${share.qrSize} بايت` : ''}
              </div>
            </div>
            {qr ? (
              <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700">
                <img src={qr} alt="رمز QR لجدول الشعبة" className="h-64 w-64" />
              </div>
            ) : qrError ? (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {qrError}
              </div>
            ) : null}
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300">{share.text}</pre>
            <p className="text-[11px] leading-5 text-slate-400">
              يفتح رمز QR نص الجدول كاملًا (المادة/المعلم/القاعة لكل حصة) دون إنترنت. للمشاركة عبر واتساب استخدم «نسخ النص».
            </p>
          </div>
        )}
      </Modal>

      {/* جودة */}
      <Modal open={qualityOpen} onClose={() => setQualityOpen(false)} title="مؤشرات جودة الجدول"
        footer={<><button className="btn-ghost" onClick={() => setQualityOpen(false)}>إغلاق</button></>}>
        <div className="space-y-3">
          <div className={cn('rounded-2xl p-4 text-center text-white', quality.score >= 85 ? 'bg-emerald-600' : quality.score >= 70 ? 'bg-brand-700' : 'bg-amber-600')}>
            <div className="text-4xl font-black">{quality.score}<span className="text-lg">/100</span></div>
            <div className="mt-1 text-sm font-bold">{quality.grade}</div>
            {genResult ? <div className="mt-1 text-[11px] opacity-90">آخر توليد: {genResult.elapsedMs} مللي ثانية · {genResult.attempts} محاولة</div> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['الحصص الموزعة', `${quality.placed} / ${quality.required}`],
              ['التغطية', `${quality.coverage}%`],
              ['فراغات المعلمين', `${quality.teacherGaps}`],
              ['فراغات الشعب', `${quality.sectionGaps}`],
              ['انتشار المواد', `${quality.spreadRatio}%`],
              ['عدالة الأنصبة', `${quality.fairness}%`],
              ['توازن الأيام', `${quality.balance}%`],
              ['فراغ/يوم معلم', `${quality.gapRate}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950">
                <div className="text-[10px] text-slate-400">{label}</div>
                <div className="font-extrabold">{value}</div>
              </div>
            ))}
          </div>
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-[11px] leading-6 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            حساب المؤشر: تغطية الحصص 55% + قلة الفراغات 18% + انتشار المواد 12% + عدالة الأنصبة 8% + توازن الأيام 7%.
            تُقاس الفراغات لكل يوم عمل للمعلم (فراغ واحد يوميًا مقبول).
          </p>
        </div>
      </Modal>

      {/* توليد */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="توليد جدول آلي بقيود"
        footer={<><button className="btn-ghost" onClick={() => setGenOpen(false)}>إلغاء</button><button className="btn-primary" onClick={doGenerate}><Sparkles size={16} /> توليد</button></>}>
        <div className="space-y-3 text-sm">
          <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs leading-6 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">
            محرك heuristic ببذرة ثابتة: يمنع تعارض المعلم والشعبة والقاعة، ويحترم النصاب والحد اليومي وعدم التوفر والمعامل.
            أي حصة يتعذر وضعها تُعرض في التعارضات بسببها، ولا تُحذف بصمت.
          </p>
          <Field label="البذرة (نفس المدخلات + نفس البذرة = نفس النتيجة)">
            <input className="input" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </Field>
          <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            سيُحفظ الجدول الحالي كمسودة جديدة، ويمكنك مقارنته ثم النشر. لن يُحذف أي جدول قديم.
          </div>
        </div>
      </Modal>

      {/* خلية */}
      <Modal open={!!cell} onClose={() => setCell(null)} title={cell?.lesson ? 'تعديل حصة' : 'إضافة حصة'}
        footer={cell?.lesson ? (
          <>
            <button className="btn-ghost text-rose-600" onClick={removeLesson}><Trash2 size={15} /> حذف</button>
            <button className="btn-ghost" onClick={() => { toggleLock(cell.lesson.id); setCell(null); toast('ok', 'تم تغيير التثبيت'); }}>
              {cell.lesson.locked ? <LockOpen size={15} /> : <Lock size={15} />} {cell.lesson.locked ? 'إلغاء التثبيت' : 'تثبيت'}
            </button>
            <button className="btn-primary" form="lesson-form">حفظ</button>
          </>
        ) : (
          <><button className="btn-ghost" onClick={() => setCell(null)}>إلغاء</button><button className="btn-primary" form="lesson-form">إضافة</button></>
        )}
      >
        <form id="lesson-form" onSubmit={saveCell} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="المادة">
            <select className="input" value={form.subject_id || ''} onChange={(e) => {
              const subjectId = Number(e.target.value);
              const a = sectionAssignments.find((x) => x.subject_id === subjectId);
              setForm({ ...form, subject_id: subjectId, teacher_id: a?.teacher_id || form.teacher_id, assignment_id: a?.id || null });
            }}>
              {db.subjects.filter((s) => s.active !== 0).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field></div>
          <Field label="المعلم">
            <select className="input" value={form.teacher_id || ''} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
              <option value="">بلا معلم</option>
              {db.teachers.filter((t) => t.active !== 0).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="القاعة">
            <select className="input" value={form.room_id || ''} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
              <option value="">قاعة الشعبة</option>
              {db.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="اليوم">
            <select className="input" value={form.day_id || ''} onChange={(e) => setForm({ ...form, day_id: e.target.value })}>
              {days.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="الحصة">
            <select className="input" value={form.period_id || ''} onChange={(e) => setForm({ ...form, period_id: e.target.value })}>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {!sectionAssignments.some((a) => a.subject_id === Number(form.subject_id)) ? (
            <div className="sm:col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              هذه المادة غير مسندة لهذه الشعبة. الحصة ستُضاف يدويًا وقد تظهر كتكرار أو تجاوز.
            </div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}