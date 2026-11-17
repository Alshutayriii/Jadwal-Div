import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Database, Download, FileSpreadsheet, FileUp,
  Loader2, Upload, Users,
} from 'lucide-react';
import { useApp, usePerm } from '../store';
import { Badge, Card, Field, PageHeader, cn } from '../components/ui';
import {
  KIND_HEADERS, csvFromRows, importTable, matrixToRows, parseCsv, tableRows, templateCsv,
} from '../lib/importExport';
import type { DataKind } from '../lib/importExport';
import { downloadBlob } from '../lib/reports';

const KINDS: { key: DataKind; label: string; hint: string }[] = [
  { key: 'teachers', label: 'المعلمون', hint: 'الاسم، الرقم الوظيفي، التخصص، النصاب، الحد اليومي، الجوال، البريد' },
  { key: 'subjects', label: 'المواد', hint: 'الاسم، المرحلة، الحصص الأسبوعية، الحد اليومي، اللون، يحتاج معمل' },
  { key: 'sections', label: 'الشعب', hint: 'الصف، الشعبة، القاعة، عدد الطلاب — يجب أن يكون الصف موجودًا' },
  { key: 'assignments', label: 'الإسنادات', hint: 'الصف، الشعبة، المادة، المعلم، الحصص الأسبوعية، القاعة' },
];

const KEY_LABEL: Record<string, string> = {
  name: 'الاسم', employee_no: 'الرقم الوظيفي', specialty: 'التخصص', weekly_load: 'النصاب',
  max_daily: 'الحد اليومي', phone: 'الجوال', email: 'البريد', stage: 'المرحلة',
  weekly_periods: 'الحصص الأسبوعية', max_per_day: 'الحد اليومي', color: 'اللون',
  needs_lab: 'يحتاج معمل', grade: 'الصف', section: 'الشعبة', room: 'القاعة',
  students: 'عدد الطلاب', subject: 'المادة', teacher: 'المعلم',
};

export default function Data() {
  const { db, importData, toast } = useApp();
  const canEdit = usePerm('data', 'edit');
  const [kind, setKind] = useState<DataKind>('teachers');
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [source, setSource] = useState('');
  const [paste, setPaste] = useState('');
  const [applied, setApplied] = useState<any>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const meta = KINDS.find((k) => k.key === kind)!;
  const current = useMemo(() => tableRows(db, kind), [db, kind]);
  const preview = useMemo(() => (rows ? importTable(db, kind, rows) : null), [db, kind, rows]);

  function reset() {
    setRows(null);
    setSource('');
    setPaste('');
    setApplied(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function useMatrix(matrix: string[][], name: string) {
    if (!matrix.length) throw new Error('الملف لا يحتوي بيانات.');
    const parsed = matrixToRows(matrix);
    if (!parsed.length) throw new Error('لم يُعثر على صفوف بيانات بعد العناوين.');
    setRows(parsed);
    setSource(name);
    setApplied(null);
    toast('ok', `تمت قراءة ${parsed.length} صفًا من «${name}». راجع المعاينة قبل التطبيق.`);
  }

  async function onFile(file?: File | null) {
    if (!file) return;
    setFileBusy(true);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][];
        useMatrix(matrix.map((r) => r.map((c) => String(c ?? ''))), file.name);
      } else {
        useMatrix(parseCsv(await file.text()), file.name);
      }
    } catch (err: any) {
      toast('err', err.message || 'تعذّر قراءة الملف');
    } finally { setFileBusy(false); }
  }

  function parsePaste() {
    try {
      if (!paste.trim()) throw new Error('الصق بيانات CSV أولًا (أول سطر عناوين الأعمدة).');
      useMatrix(parseCsv(paste), 'بيانات ملصقة');
    } catch (err: any) { toast('err', err.message); }
  }

  function applyImport() {
    if (!rows || !preview) return;
    if (preview.errors.length && !confirm(`يوجد ${preview.errors.length} سطرًا به أخطاء وسيُتجاوز. متابعة؟`)) return;
    try {
      const result = importData(kind, rows);
      setApplied(result);
      setRows(null);
      setPaste('');
      setSource('');
      if (fileRef.current) fileRef.current.value = '';
      toast('ok', `تم الاستيراد: +${result.added} جديد، ~${result.updated} محدّث، ${result.skipped} متجاوز`);
    } catch (err: any) { toast('err', err.message); }
  }

  function exportCsv() {
    downloadBlob(`${meta.label}.csv`, new Blob([csvFromRows(current, KIND_HEADERS[kind])], { type: 'text/csv;charset=utf-8' }));
  }

  async function exportXlsx() {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(current, { header: KIND_HEADERS[kind] });
      (ws as any)['!views'] = [{ RTL: true }];
      (ws as any)['!cols'] = KIND_HEADERS[kind].map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, meta.label);
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(`${meta.label}.xlsx`, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    } catch (err: any) { toast('err', err.message || 'تعذّر تصدير Excel'); }
  }

  function downloadTemplate() {
    downloadBlob(`قالب-${meta.label}.csv`, new Blob([templateCsv(kind)], { type: 'text/csv;charset=utf-8' }));
  }

  const headers = rows?.[0] ? Object.keys(rows[0]) : [];

  return (
    <div>
      <PageHeader
        icon={Database}
        title="الاستيراد والتصدير"
        subtitle="نقل بيانات المعلمين والمواد والشعب والإسنادات من Excel أو CSV وإليه، مع معاينة قبل التطبيق"
        actions={(
          <>
            <button className="btn-ghost" onClick={exportCsv}><Download size={15} /> CSV الحالي</button>
            <button className="btn-ghost" onClick={exportXlsx}><FileSpreadsheet size={15} /> Excel الحالي</button>
            <button className="btn-primary" onClick={downloadTemplate}><FileSpreadsheet size={15} /> قالب فارغ</button>
          </>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.map((k) => (
          <button key={k.key} onClick={() => { setKind(k.key); reset(); }}
            className={cn('card p-3 text-right text-sm font-bold transition hover:border-brand-400', kind === k.key && 'border-brand-600 bg-brand-50 dark:bg-brand-900/30')}>
            <div>{k.label}</div>
            <div className="mt-0.5 text-[11px] font-normal text-slate-400">
              {k.key === 'teachers' ? `${db.teachers.length} سجل` : k.key === 'subjects' ? `${db.subjects.length} مادة` : k.key === 'sections' ? `${db.sections.length} شعبة` : `${db.assignments.length} إسنادًا`}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-extrabold"><Upload size={17} /> استيراد {meta.label}</h2>
          <p className="mb-3 text-xs leading-5 text-slate-500">{meta.hint}</p>
          <p className="mb-3 rounded-xl bg-brand-50 px-3 py-2 text-[11px] leading-5 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            يطابق السجلات الموجودة ويحدّثها بدل تكرارها: المعلم بالرقم الوظيفي أو الاسم، المادة بالاسم،
            الشعبة بالصف والاسم، الإسناد بالشعبة والمادة. نزّل «قالب فارغ» لمعرفة العناوين المقبولة.
          </p>

          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn-primary w-full" onClick={() => fileRef.current?.click()} disabled={!canEdit || fileBusy}>
            {fileBusy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            {fileBusy ? 'جارٍ قراءة الملف…' : 'اختيار ملف CSV أو Excel'}
          </button>

          <div className="my-3 text-center text-[11px] text-slate-400">أو الصق بيانات CSV</div>
          <textarea className="input min-h-24 font-mono text-[11px]" dir="ltr" placeholder={KIND_HEADERS[kind].join(',')}
            value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="btn-ghost mt-2 w-full" onClick={parsePaste} disabled={!canEdit || !paste.trim()}>
            <FileSpreadsheet size={15} /> قراءة البيانات الملصقة
          </button>

          {!canEdit ? <p className="mt-3 text-xs font-semibold text-rose-600">ليست لديك صلاحية استيراد البيانات.</p> : null}
          <p className="mt-3 text-[11px] text-slate-400">
            للنسخ الاحتياطي الكامل (كل الجداول والجداول الزمنية) استخدم <Link to="/settings" className="font-bold text-brand-700 underline">الإعدادات</Link>.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-extrabold"><Download size={17} /> تصدير {meta.label}</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="brand">{current.length} صفًا</Badge>
            <Badge tone="teal">CSV بترميز UTF-8 مع BOM</Badge>
            <Badge tone="slate">Excel RTL</Badge>
          </div>
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>{KIND_HEADERS[kind].map((h) => <th key={h} className="border border-slate-200 p-1.5 text-right dark:border-slate-800">{h}</th>)}</tr>
              </thead>
              <tbody>
                {current.slice(0, 60).map((row, i) => (
                  <tr key={i}>{KIND_HEADERS[kind].map((h) => <td key={h} className="border border-slate-100 p-1.5 dark:border-slate-800">{row[h] ?? ''}</td>)}</tr>
                ))}
                {!current.length ? <tr><td colSpan={KIND_HEADERS[kind].length} className="p-6 text-center text-slate-400">لا بيانات بعد.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {current.length > 60 ? <p className="mt-2 text-[11px] text-slate-400">تُصدَّر كل الصفوف ({current.length}) وليس المعروض فقط.</p> : null}
        </Card>
      </div>

      {rows && preview ? (
        <Card className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-extrabold">معاينة «{source}»</h2>
              <p className="text-xs text-slate-400">لم يُحفظ شيء بعد. راجع النتائج ثم اضغط «تطبيق الاستيراد».</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">جديد: {preview.added}</Badge>
              <Badge tone="brand">تحديث: {preview.updated}</Badge>
              <Badge tone={preview.skipped ? 'amber' : 'slate'}>متجاوز: {preview.skipped}</Badge>
              <Badge tone={preview.errors.length ? 'rose' : 'green'}>أخطاء: {preview.errors.length}</Badge>
            </div>
          </div>

          {preview.errors.length ? (
            <div className="mb-3 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {preview.errors.map((e, i) => <div key={i} className="flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {e}</div>)}
            </div>
          ) : null}

          <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>{headers.map((h) => <th key={h} className="border border-slate-200 p-1.5 text-right dark:border-slate-800">{KEY_LABEL[h] || h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((row, i) => (
                  <tr key={i}>{headers.map((h) => <td key={h} className="border border-slate-100 p-1.5 dark:border-slate-800">{row[h] ?? ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 30 ? <p className="mt-2 text-[11px] text-slate-400">تُعرض أول 30 صفًا من {rows.length}.</p> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={applyImport}><CheckCircle2 size={16} /> تطبيق الاستيراد</button>
            <button className="btn-ghost" onClick={reset}>إلغاء</button>
          </div>
        </Card>
      ) : null}

      {applied ? (
        <Card className="mt-4 border-emerald-200 dark:border-emerald-900">
          <h2 className="mb-2 flex items-center gap-2 font-extrabold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={18} /> تم تطبيق الاستيراد</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            أُضيف {applied.added} سجلًا، وحُدّث {applied.updated}، وتُجوز {applied.skipped}.
            {applied.errors.length ? ` مع ${applied.errors.length} سطرًا به أخطاء.` : ''}
          </p>
          <Link to={kind === 'assignments' ? '/sections' : kind === 'teachers' ? '/teachers' : kind === 'subjects' ? '/subjects' : '/sections'}
            className="btn-ghost btn-sm mt-3">عرض {meta.label} <ArrowRight size={14} /></Link>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="mb-2 flex items-center gap-2 font-extrabold"><Users size={17} /> نصائح عملية</h2>
        <ul className="grid gap-2 text-xs leading-6 text-slate-600 sm:grid-cols-2 dark:text-slate-300">
          <li>• صدّر البيانات الحالية أولًا كنسخة مرجعية قبل أي استيراد كبير.</li>
          <li>• الأعمدة العربية المقبولة تشمل «اسم المعلم»، «النصاب»، «الحصص الأسبوعية»، «الصف»، «الشعبة».</li>
          <li>• يمكن استخدام CSV المفصول بفاصلة أو فاصلة منقوطة أو Tab.</li>
          <li>• ملفات Excel تُقرأ من الورقة الأولى فقط.</li>
        </ul>
      </Card>
    </div>
  );
}
