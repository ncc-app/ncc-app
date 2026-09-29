// Attendance feature type definitions

import type { Division, NccYear } from "@/shared/config/constants";

// Session status
export type SessionStatus = "draft" | "open" | "locked";

// Attendance mark status
export type AttendanceStatus = "P" | "A"; // Present, Absent

export type AttendanceCategory =
  | "Theory Class"
  | "Parade"
  | "Volunteering"
  | "Other";

// Cached session statistics
export interface SessionStats {
  total: number;
  present: number;
  absent: number;
}

// Redesigned AttendanceSession - division-centric
export interface AttendanceSession {
  id?: string;
  // Required division targeting
  divisionId: Division;
  nccYear: NccYear;
  // Session details
  title: string;
  date: string; // YYYY-MM-DD
  category?: AttendanceCategory;
  paradeCount?: number; // Number of parades this session counts as (default 1, 2 for Saturday/double parades)
  isOfficialParade?: boolean; // Whether this is an official parade (used for official-only attendance reports)
  // Status
  status: SessionStatus;
  // Cached statistics (updated on mark changes)
  stats: SessionStats;
  // Metadata
  createdBy: string;
  createdAt: string;
  lockedAt?: string;
  lockedBy?: string;
}

// Individual attendance mark
export interface AttendanceMark {
  cadetId: string;
  status: AttendanceStatus;
  markedBy: string;
  markedAt: string;
  deviceId?: string;
  notes?: string;
}

// Monthly stats breakdown
export interface MonthlyStats {
  total: number;
  present: number;
  absent: number;
}

export interface CategoryStats {
  total: number;
  present: number;
  absent: number;
}

// Per-cadet attendance statistics (stored in cadetAttendanceStats collection)
export interface CadetAttendanceStats {
  cadetId: string;
  divisionId: Division;
  nccYear: NccYear;
  // Overall stats
  totalSessions: number;
  present: number;
  absent: number;
  attendanceRate: number; // present / total * 100
  // Monthly breakdown for trends
  monthly: Record<string, MonthlyStats>; // Key: 'YYYY-MM'
  categoryBreakdown?: Record<AttendanceCategory, CategoryStats>;
  // Recent sessions for quick reference
  recentSessionIds: string[];
  updatedAt: string;
}

// Status display helpers
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  P: "Present",
  A: "Absent",
};

export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  P: "success",
  A: "danger",
};

// Form data for creating/editing sessions
export interface SessionFormData {
  divisionId: Division;
  nccYear: NccYear;
  title: string;
  category?: AttendanceCategory;
  date: string;
  paradeCount?: number; // 1 = normal, 2 = Saturday/double parade
  isOfficialParade?: boolean; // Whether this is an official parade
}

// Bulk marking payload
export interface BulkMarkPayload {
  sessionId: string;
  marks: Array<{
    cadetId: string;
    status: AttendanceStatus;
  }>;
  markedBy: string;
}
