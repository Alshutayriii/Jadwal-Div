export type Role = 'system_admin' | 'principal' | 'vice' | 'scheduler' | 'teacher';
export type Level = 'none' | 'view' | 'edit';
export type PermissionMatrix = Record<Role, Record<string, Level>>;

export interface School {
  id: number;
  name: string;
  logo?: string | null;
  stage: string;
  gender: string;
  academic_year: string;
  term: string;
  principal: string;
  phone: string;
  email: string;
  address: string;
  motto: string;
  max_daily_section: number;
}

export interface Term { id: number; name: string; start_date: string; end_date: string; active: number; }
export interface Day { id: number; name: string; idx: number; active: number; }
export interface Period { id: number; name: string; idx: number; start_time?: string; end_time?: string; kind: 'lesson' | 'break' | string; active: number; }
export interface Room { id: number; name: string; kind: string; capacity?: number; building?: string; floor?: string; }
export interface Grade { id: number; name: string; ord?: number; stage?: string; }
export interface Section { id: number; grade_id: number; name: string; room_id?: number | null; students?: number; active: number; track?: string; }
export interface Subject {
  id: number; name: string; stage: string; track?: string; weekly_periods: number;
  max_per_day: number; color: string; needs_lab: number; lab_kind?: string; consecutive?: number; active: number;
}
export interface Teacher {
  id: number; name: string; employee_no: string; specialty: string; weekly_load: number;
  max_daily: number; phone?: string; email?: string; notes?: string; active: number;
}
export interface TeacherSubject { id: number; teacher_id: number; subject_id: number; }
export interface Unavailable { id: number; teacher_id: number; day_id: number; period_id: number; reason?: string; }
export interface Assignment {
  id: number; section_id: number; subject_id: number; teacher_id?: number | null;
  weekly_periods: number; room_id?: number | null; note?: string;
}
export interface Schedule { id: number; name: string; status: 'draft' | 'published'; created_at?: string; notes?: string; }
export interface Lesson {
  id: number; schedule_id: number; assignment_id?: number | null; section_id: number;
  subject_id: number; teacher_id?: number | null; room_id?: number | null;
  day_id: number; period_id: number; locked?: number;
}
export interface Exam {
  id: number; title?: string; subject_id: number; grade_id?: number | null; section_id?: number | null;
  day_id: number; period_id: number; room_id?: number | null; invigilator_id?: number | null;
  duration?: number; notes?: string;
}
export interface Absence { id: number; date: string; teacher_id: number; reason?: string; note?: string; created_at?: string; }
export interface Cover {
  id: number; date: string; absence_id?: number | null; lesson_id?: number | null;
  absent_teacher_id: number; substitute_id?: number | null; section_id?: number | null;
  subject_id?: number | null; day_id?: number | null; period_id?: number | null;
  status: 'assigned' | 'unfilled' | string; note?: string;
}
export interface Area { id: number; name: string; kind: string; building?: string; floor?: string; location?: string; active: number; }
export interface Duty { id: number; area_id: number; day_id: number; period_id: number; teacher_id?: number | null; status: string; note?: string; }
export interface CalendarEvent { id: number; title: string; type: string; start_date: string; end_date: string; note?: string; }
export interface User {
  id: number; name: string; username: string; role: Role; teacher_id?: number | null;
  active: number; password_hash?: string; created_at?: string;
}
export interface AuditEntry { id: number; username: string; action: string; entity?: string; details?: string; created_at: string; }
export interface AppNotification { id: number; title: string; body?: string; read: number; created_at?: string; }

export interface DB {
  school: School;
  terms: Term[];
  days: Day[];
  periods: Period[];
  rooms: Room[];
  grades: Grade[];
  sections: Section[];
  subjects: Subject[];
  teachers: Teacher[];
  teacher_subjects: TeacherSubject[];
  teacher_unavailable: Unavailable[];
  assignments: Assignment[];
  exams: Exam[];
  schedules: Schedule[];
  lessons: Lesson[];
  absences: Absence[];
  covers: Cover[];
  supervision_areas: Area[];
  duties: Duty[];
  calendar_events: CalendarEvent[];
  users: User[];
  notifications: AppNotification[];
  audit_log: AuditEntry[];
  settings: Record<string, string>;
  permissions: PermissionMatrix;
  version?: number;
}

export interface Session {
  user: User;
  role: Role;
  teacherId?: number | null;
  at: string;
}

export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string; }

export type EntityKey =
  | 'teachers' | 'subjects' | 'sections' | 'rooms' | 'grades'
  | 'absent' | 'duties' | 'users' | 'calendar_events';
