import { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Database, Grid3X3, Keyboard, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { useApp } from '../store';
import { cn } from './ui';

const STEPS = [
  {
    icon: Sparkles,
    title: 'مرحبًا بك في جدول المدرسة Pro',
    body: 'كل شيء يعمل على جهازك دون إنترنت: الجداول، الغياب، الإشراف، والتقارير. لا يوجد خادم ولا تُرسل بياناتك إلى أي جهة.',
    hint: 'الحساب التجريبي: admin / admin123',
  },
  {
    icon: Grid3X3,
    title: 'ولّد الجدول ثم عدّله بالسحب',
    body: 'من «الجدول الدراسي» اضغط «توليد آلي». ثم اسحب أي حصة إلى خانة أخرى لنقلها أو تبديلها؛ تُلوَّن الخانة بالأخضر إن كانت صالحة وبالأحمر إن كان فيها تعارض مع سبب واضح. كل حركة قابلة للتراجع بـ Ctrl+Z.',
    hint: 'مؤشر الجودة يبيّن التغطية والفراغات وعدالة الأنصبة',
  },
  {
    icon: ShieldCheck,
    title: 'الغياب والإشراف بضغطة',
    body: 'سجّل غياب المعلمين ليوزّع النظام حصص الانتظار تلقائيًا مع منع التعارض، وولّد مناوبات الإشراف على المواقع والفترات.',
    hint: 'يمكنك تعديل البديل يدويًا مع فحص التعارض',
  },
  {
    icon: Database,
    title: 'تقارير احترافية ونسخ آمنة',
    body: '13 تقريرًا جاهزًا مع CSV وExcel وPDF عربي حقيقي. من الإعدادات أنشئ لقطة سريعة، أو نسخة مشفّرة بكلمة مرور، وقارن بين اللقطات قبل الاستعادة.',
    hint: 'PDF يُنشأ داخل التطبيق دون إنترنت',
  },
  {
    icon: Keyboard,
    title: 'اختصارات تجعل العمل أسرع',
    body: 'Ctrl+K للبحث الشامل عن أي معلم أو شعبة أو صفحة، وCtrl+Z / Ctrl+Shift+Z للتراجع والإعادة، وEsc لإلغاء السحب. جولة الإعدادات تتيح إعادة هذا الدليل متى شئت.',
    hint: 'ابحث مثلًا: «شعبة أ» أو «رياضيات»',
  },
];

export default function Onboarding() {
  const { db, session, setSetting } = useApp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!session?.user) return;
    if (db.settings.onboarded === '1') return;
    setOpen(true);
  }, [session?.user?.id, db.settings.onboarded]);

  useEffect(() => {
    const replay = () => { setStep(0); setOpen(true); };
    window.addEventListener('stp:onboarding', replay);
    return () => window.removeEventListener('stp:onboarding', replay);
  }, []);

  function finish() {
    setSetting('onboarded', '1');
    setOpen(false);
  }

  if (!open) return null;
  const Current = STEPS[step];
  const Icon = Current.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="جولة تعريفية">
      <div className="card w-full max-w-lg overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 bg-gradient-to-l from-brand-700 to-brand-600 p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Icon size={22} /></span>
            <div>
              <div className="text-xs opacity-80">جولة تعريفية · {step + 1} من {STEPS.length}</div>
              <h2 className="text-lg font-extrabold leading-6">{Current.title}</h2>
            </div>
          </div>
          <button onClick={finish} className="rounded-lg p-1 text-white/80 hover:bg-white/15" aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="p-5">
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{Current.body}</p>
          {Current.hint ? (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400">{Current.hint}</div>
          ) : null}
          <div className="mt-4 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`الخطوة ${i + 1}`}
                className={cn('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-brand-600' : 'w-2.5 bg-slate-200 dark:bg-slate-700')}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <button className="btn-ghost btn-sm" onClick={finish}>تخطّي الجولة</button>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowRight size={14} /> السابق
            </button>
            {last ? (
              <button className="btn-primary btn-sm" onClick={finish}><CheckCircle2 size={15} /> ابدأ العمل</button>
            ) : (
              <button className="btn-primary btn-sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                التالي <ArrowLeft size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
