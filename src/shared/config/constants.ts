// User roles
export const ROLES = {
  VISITOR: "visitor",
  MEMBER: "member", // basic role (trainee)
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
  ALUMNI: "alumni",
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

// Attendance status
export const ATTENDANCE_STATUS = {
  PRESENT: "P",
  ABSENT: "A",
} as const;

export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

// Event types
export const EVENT_TYPES = {
  CAMP: "camp",
  PARADE: "parade",
  TRAINING: "training",
  COMPETITION: "competition",
  SOCIAL_WORK: "social_work",
  NATIONAL_DAY: "national_day",
  OTHER: "other",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// Duty roles
export const DUTY_ROLES = {
  ORDERLY: "orderly",
  OFFICE: "office",
  QUARTER_GUARD: "quarter_guard",
  FLAG_DETAIL: "flag_detail",
} as const;

export type DutyRole = (typeof DUTY_ROLES)[keyof typeof DUTY_ROLES];

// NCC Ranks (Army Wing)
export interface Rank {
  code: string;
  name: string;
  order: number;
}

export const NCC_RANKS: Rank[] = [
  { code: "CDT", name: "Cadet", order: 1 },
  { code: "LCPL", name: "Lance Corporal", order: 2 },
  { code: "CPL", name: "Corporal", order: 3 },
  { code: "SGT", name: "Sergeant", order: 4 },
  { code: "CQMS", name: "Company Quarter Master Sergeant", order: 5 },
  { code: "CSM", name: "Company Sergeant Major", order: 6 },
  { code: "CUO", name: "Cadet Under Officer", order: 7 },
  { code: "SUO", name: "Senior Under Officer", order: 8 },
];

// Academic departments
export interface DepartmentDef {
  code: string;
  name: string;
  courseTenure: number;
}

export const DEPARTMENT_DEFS = [
  { code: "IT", name: "Information Technology", courseTenure: 4 },
  { code: "CSE", name: "Computer Science and Engineering", courseTenure: 4 },
  {
    code: "ECE",
    name: "Electronics and Communication Engineering",
    courseTenure: 4,
  },
  {
    code: "EEE",
    name: "Electrical and Electronics Engineering",
    courseTenure: 4,
  },
  { code: "AMCS", name: "Data Science", courseTenure: 5 },
  {
    code: "CSE AIML",
    name: "Computer Science and Engineering (AI & ML)",
    courseTenure: 4,
  },
  { code: "MECH", name: "Mechanical Engineering", courseTenure: 4 },
  { code: "MECT", name: "Mechatronics", courseTenure: 4 },
  { code: "CIVIL", name: "Civil Engineering", courseTenure: 4 },
  {
    code: "CSBS",
    name: "Computer Science and Business Systems",
    courseTenure: 4,
  },
  { code: "ARCH", name: "Architecture", courseTenure: 5 },
] as const;

export type Department = (typeof DEPARTMENT_DEFS)[number]["code"];

// Academic years
export const ACADEMIC_YEARS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
] as const;
export type AcademicYear = (typeof ACADEMIC_YEARS)[number];

// Academic year equivalent aliases.
// Keep ACADEMIC_YEARS canonical to avoid breaking existing UI select/options.
export const ACADEMIC_YEAR_EQUIVALENTS: Record<
  AcademicYear,
  readonly string[]
> = {
  "1st Year": ["1st Year", "1st", "1", "I"],
  "2nd Year": ["2nd Year", "2nd", "2", "II"],
  "3rd Year": ["3rd Year", "3rd", "3", "III"],
  "4th Year": ["4th Year", "4th", "4", "IV"],
  "5th Year": ["5th Year", "5th", "5", "V"],
} as const;

// Year display helpers
export const ROMAN_YEAR_MAP: Record<string, string> = {
  "1st": "I",
  "2nd": "II",
  "3rd": "III",
  "4th": "IV",
  "5th": "V",
  "1": "I",
  "2": "II",
  "3": "III",
  "4": "IV",
  "5": "V",
  I: "I",
  II: "II",
  III: "III",
  IV: "IV",
  V: "V",
  "1st Year": "I",
  "2nd Year": "II",
  "3rd Year": "III",
  "4th Year": "IV",
  "5th Year": "V",
};

// Notification channels
export const NOTIFICATION_CHANNELS = {
  IN_APP: "in_app",
  EMAIL: "email",
  SMS: "sms",
  WHATSAPP: "whatsapp",
} as const;

export type NotificationChannel =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

// Export formats
export const EXPORT_FORMATS = {
  CSV: "csv",
  EXCEL: "xlsx",
  PDF: "pdf",
} as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS];

// NCC Divisions (only SD and SW for this unit)
export const DIVISIONS = ["SD", "SW"] as const;
export type Division = (typeof DIVISIONS)[number];

export const DIVISION_LABELS: Record<Division, string> = {
  SD: "Senior Division",
  SW: "Senior Wing",
};

// NCC Training Years (1st, 2nd, 3rd year of NCC training)
export const NCC_YEARS = ["1st Year", "2nd Year", "3rd Year"] as const;
export type NccYear = (typeof NCC_YEARS)[number];

// Attendance session title options. Custom titles are supported through Other.
export const ATTENDANCE_SESSION_TITLE_OPTIONS = [
  "Parade",
  "Theory",
  "Volunteering",
  "Other",
] as const;
export type AttendanceSessionTitle =
  (typeof ATTENDANCE_SESSION_TITLE_OPTIONS)[number];

// NCC year equivalent aliases.
// Keep NCC_YEARS canonical to avoid side effects in existing modules.
export const NCC_YEAR_EQUIVALENTS: Record<NccYear, readonly string[]> = {
  "1st Year": ["1st Year", "1st", "1", "I"],
  "2nd Year": ["2nd Year", "2nd", "2", "II"],
  "3rd Year": ["3rd Year", "3rd", "3", "III"],
} as const;

const normalizeYearToken = (value: string | number): string =>
  String(value).trim().toLowerCase().replace(/\s+/g, "");

const ACADEMIC_YEAR_ALIAS_MAP: Record<string, AcademicYear> = Object.entries(
  ACADEMIC_YEAR_EQUIVALENTS,
).reduce(
  (acc, [canonical, aliases]) => {
    aliases.forEach((alias) => {
      acc[normalizeYearToken(alias)] = canonical as AcademicYear;
    });
    return acc;
  },
  {} as Record<string, AcademicYear>,
);

const NCC_YEAR_ALIAS_MAP: Record<string, NccYear> = Object.entries(
  NCC_YEAR_EQUIVALENTS,
).reduce(
  (acc, [canonical, aliases]) => {
    aliases.forEach((alias) => {
      acc[normalizeYearToken(alias)] = canonical as NccYear;
    });
    return acc;
  },
  {} as Record<string, NccYear>,
);

export function normalizeAcademicYear(
  value?: string | number | null,
): AcademicYear | "" {
  if (value === undefined || value === null) return "";
  return ACADEMIC_YEAR_ALIAS_MAP[normalizeYearToken(value)] || "";
}

export function normalizeNccYear(value?: string | number | null): NccYear | "" {
  if (value === undefined || value === null) return "";
  return NCC_YEAR_ALIAS_MAP[normalizeYearToken(value)] || "";
}

// Attendance thresholds
export const ATTENDANCE_THRESHOLDS = {
  LOW: 75, // Below this is low attendance
  GOOD: 85, // Above this is good
  EXCELLENT: 95, // Above this is excellent
} as const;

// Announcement categories
export const ANNOUNCEMENT_CATEGORIES = {
  GENERAL: "general",
  CAMPS: "camps",
  ACTIVITIES: "activities",
  PARADES: "parades",
  RECRUITMENT: "recruitment",
  CELEBRATIONS: "celebrations",
} as const;

export type AnnouncementCategory =
  (typeof ANNOUNCEMENT_CATEGORIES)[keyof typeof ANNOUNCEMENT_CATEGORIES];

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<
  AnnouncementCategory,
  string
> = {
  general: "📢 General",
  camps: "⛺ Camps",
  activities: "🌳 Activities",
  parades: "🎖️ Parades",
  recruitment: "📢 Recruitment",
  celebrations: "🎊 Celebrations",
};

export const ANNOUNCEMENT_CATEGORY_COLORS: Record<
  AnnouncementCategory,
  string
> = {
  general: "secondary",
  camps: "success",
  activities: "info",
  parades: "primary",
  recruitment: "danger",
  celebrations: "success",
};

// Announcement visibility
export const ANNOUNCEMENT_VISIBILITY = {
  PUBLIC: "public",
  AUTH_ONLY: "auth_only",
} as const;

export type AnnouncementVisibility =
  (typeof ANNOUNCEMENT_VISIBILITY)[keyof typeof ANNOUNCEMENT_VISIBILITY];

export const ANNOUNCEMENT_VISIBILITY_LABELS: Record<
  AnnouncementVisibility,
  string
> = {
  public: "Public",
  auth_only: "Cadets & ANOs",
};

// Common blood group options used across forms
export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "A1+",
  "A1-",
  "A1B+",
  "A1B-",
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

// Event Drive types
export const DRIVE_TYPES = {
  VOLUNTEERING: "volunteering",
  CAMP_WILLINGNESS: "camp_willingness",
  FIRING_SELECTION: "firing_selection",
  OTHER: "other",
} as const;

export type DriveType = (typeof DRIVE_TYPES)[keyof typeof DRIVE_TYPES];

export const DRIVE_TYPE_LABELS: Record<DriveType, string> = {
  volunteering: "Volunteering",
  camp_willingness: "Camp Willingness",
  firing_selection: "Firing Selection",
  other: "Other",
};

// Event Drive status
export const DRIVE_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
} as const;

export type DriveStatus = (typeof DRIVE_STATUS)[keyof typeof DRIVE_STATUS];

// Event Drive response types
export const DRIVE_RESPONSE = {
  OPTED_IN: "opted_in",
  OPTED_OUT: "opted_out",
} as const;

export type DriveResponseType =
  (typeof DRIVE_RESPONSE)[keyof typeof DRIVE_RESPONSE];

export const DRIVE_RESPONSE_LABELS: Record<DriveResponseType | "no_response", string> = {
  opted_in: "Opted In",
  opted_out: "Opted Out",
  no_response: "No Response",
};
