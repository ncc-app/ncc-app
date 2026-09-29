export type UserRole = "member" | "admin" | "superadmin" | "alumni";

export interface ManagedUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  userType?: "ano" | "cadet";
  createdAt: string;
  status: string;
  regimentalNumber?: string;
  division?: "SD" | "SW";
  dateOfBirth?: string;
  dateOfEnrollment?: string;
  nccYear?: string;
  year?: string;
  residentialStatus?: string;
  department?: string;
  rollNo?: string;
  registerNumber?: string;
  phone?: string;
  bloodGroup?: string;
  fatherName?: string;
  address?: string;
  rank?: string;
  lastUpdated?: string;
}

export interface PendingCadet {
  id: string;
  uid?: string;
  emailVerified?: boolean;
  name: string;
  email: string;
  tempPassword?: string;
  regimentalNumber: string;
  division: "SD" | "SW";
  dateOfBirth: string;
  dateOfEnrollment: string;
  nccYear?: string;
  year: "1st Year" | "2nd Year" | "3rd Year" | "4th Year" | "5th Year";
  residentialStatus: "Day Scholar" | "Hosteller";
  department: string;
  rollNo: string;
  registerNumber: string;
  phone: string;
  bloodGroup: string;
  fatherName?: string;
  address?: string;
  rank: string;
  createdAt: string;
  photoURL?: string;
  cloudinaryPublicId?: string;
}
