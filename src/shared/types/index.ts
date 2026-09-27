// Type definitions for the application

import {
  AcademicYear,
  AttendanceStatus,
  Department,
  DriveResponseType,
  DriveStatus,
  DriveType,
  EventType,
  NccYear,
  UserRole,
} from "../config/constants";

export type UserType = "ano" | "cadet";

export interface User {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  userType?: UserType;
  status: "pending" | "active" | "inactive" | "rejected";
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface Cadet {
  userId: string;

  // Personal Details
  name: string;
  dateOfBirth: string;
  email: string;

  // NCC Details
  division: "SD" | "SW";
  regimentalNumber: string;
  dateOfEnrollment: string;
  rank: string;

  // Academic Details
  year: AcademicYear | string;
  nccYear?: NccYear | string;
  residentialStatus?: string;
  department: Department | string;
  rollNo: string;
  registerNumber: string;

  // Additional Details
  phone: string;
  bloodGroup: string;
  fatherName?: string;
  address?: string;

  // System fields
  joinDate: string;
  nccNo?: string;
}

export interface AttendanceSession {
  id?: string;
  title: string;
  date: string;
  year?: string;
  division?: string;
  createdAt: string;
  locked: boolean;
  totalCadets: number;
}

export interface AttendanceMark {
  sessionId: string;
  cadetId: string;
  status: AttendanceStatus;
  timestamp: string;
  deviceId?: string;
}

export interface Event {
  id?: string;
  title: string;
  type: EventType;
  startAt: string;
  endAt: string;
  location: string;
  capacity?: number;
  description?: string;
}

export interface Duty {
  id?: string;
  role: string;
  date: string;
  startAt: string;
  endAt: string;
  location?: string;
  notes?: string;
}

export interface GalleryAlbum {
  id?: string;
  title: string;
  eventId?: string;
  visibility: "public" | "private";
}

export interface Achievement {
  id?: string;
  cadetId: string;
  title: string;
  level: string;
  date: string;
  proofUrl?: string;
}

export interface Notification {
  id?: string;
  title: string;
  body: string;
  audienceFilter: string;
  channel: string;
  sentAt: string;
}

// CMS document types
export interface CmsSection {
  heading: string;
  body: string;
}

export interface CmsDoc {
  title: string;
  sections: CmsSection[];
  updatedAt?: string;
  updatedBy?: string;
  visibility?: "public" | "private";
}

// Event Drive types
export interface EventDrive {
  id?: string;
  title: string;
  description?: string;
  driveType: DriveType;
  customDriveType?: string;
  targetDivision: "SD" | "SW";
  targetNccYear: string;
  date: string;
  location?: string;
  capacity?: number;
  deadline: string;
  status: DriveStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    optedIn: number;
    optedOut: number;
    noResponse: number;
  };
}

export interface DriveResponse {
  cadetUid: string;
  cadetName: string;
  division: "SD" | "SW";
  nccYear: string;
  response: DriveResponseType;
  reason?: string;
  respondedAt: string;
}
