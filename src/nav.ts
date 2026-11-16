import {
  LayoutDashboard, UserRound, Building2, Users, BookOpen, Layers, CalendarDays, Grid3X3,
  UserMinus, ShieldCheck, FileText, UserCog, Settings, Monitor,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: any;
  module: string;
  keywords?: string;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, module: 'dashboard', keywords: 'الرئيسية إحصاءات' },
  { to: '/portal', label: 'بوابة المعلم', icon: UserRound, module: 'portal', keywords: 'جدولي معلم' },
  { to: '/school', label: 'بيانات المدرسة', icon: Building2, module: 'school', keywords: 'شعار مدير سنة' },
  { to: '/teachers', label: 'المعلمون', icon: Users, module: 'teachers', keywords: 'نصاب تخصص' },
  { to: '/subjects', label: 'المواد', icon: BookOpen, module: 'subjects', keywords: 'منهج حصص' },
  { to: '/sections', label: 'الصفوف والشعب', icon: Layers, module: 'sections', keywords: 'إسناد صف شعبة' },
  { to: '/calendar', label: 'التقويم', icon: CalendarDays, module: 'calendar', keywords: 'إجازات أحداث' },
  { to: '/timetable', label: 'الجدول الدراسي', icon: Grid3X3, module: 'timetable', keywords: 'توليد تعارض نشر' },
  { to: '/absence', label: 'الغياب والانتظار', icon: UserMinus, module: 'absence', keywords: 'بديل تغطية' },
  { to: '/duty', label: 'الإشراف والمناوبة', icon: ShieldCheck, module: 'duty', keywords: 'مناوبات مواقع' },
  { to: '/reports', label: 'التقارير', icon: FileText, module: 'reports', keywords: 'تصدير pdf csv excel' },
  { to: '/users', label: 'المستخدمون', icon: UserCog, module: 'users', keywords: 'حسابات صلاحيات' },
  { to: '/settings', label: 'الإعدادات', icon: Settings, module: 'settings', keywords: 'نسخ احتياطي تشفير' },
  { to: '/tv', label: 'شاشة العرض', icon: Monitor, module: 'dashboard', keywords: 'شاشة تلفاز' },
];
