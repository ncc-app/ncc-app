import { db } from "@/shared/config/firebase";
import type { Cadet } from "@/shared/types";
import type { Division, NccYear } from "@/shared/config/constants";
import { isCadetUser } from "@/shared/utils/userType";
import type {
  AttendanceMark,
  AttendanceCategory,
  AttendanceSession,
  AttendanceStatus,
  SessionStats,
  SessionFormData,
  CadetAttendanceStats,
  BulkMarkPayload,
} from "./attendance.types";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { format } from "date-fns";

const sessionsCol = collection(db, "attendanceSessions");

// ============ SESSION OPERATIONS ============

export async function listSessions(): Promise<
  (AttendanceSession & { id: string })[]
> {
  const q = query(sessionsCol, orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as AttendanceSession),
  }));
}

export async function getSessionsByDivision(
  divisionId: Division,
  nccYear?: NccYear,
): Promise<(AttendanceSession & { id: string })[]> {
  let q = query(
    sessionsCol,
    where("divisionId", "==", divisionId),
    orderBy("date", "desc"),
  );
  if (nccYear) {
    q = query(
      sessionsCol,
      where("divisionId", "==", divisionId),
      where("nccYear", "==", nccYear),
      orderBy("date", "desc"),
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as AttendanceSession),
  }));
}

export function listenSessions(
  cb: (items: (AttendanceSession & { id: string })[]) => void,
) {
  const q = query(sessionsCol, orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as AttendanceSession) })),
    );
  });
}

export function listenSessionsByDivision(
  divisionId: Division,
  nccYear: NccYear,
  cb: (items: (AttendanceSession & { id: string })[]) => void,
) {
  const q = query(
    sessionsCol,
    where("divisionId", "==", divisionId),
    where("nccYear", "==", nccYear),
    orderBy("date", "desc"),
  );
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as AttendanceSession) })),
    );
  });
}

export async function createSession(
  data: SessionFormData,
  createdBy: string,
  totalCadets: number,
): Promise<string> {
  const payload: Omit<AttendanceSession, "id"> = {
    ...data,
    status: "draft",
    stats: {
      total: totalCadets,
      present: 0,
      absent: 0,
    },
    createdBy,
    createdAt: new Date().toISOString(),
  };

  // Remove undefined fields
  const cleanPayload = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  );

  const ref = await addDoc(sessionsCol, cleanPayload);
  return ref.id;
}

export async function getSession(
  sessionId: string,
): Promise<(AttendanceSession & { id: string }) | null> {
  const snap = await getDoc(doc(db, "attendanceSessions", sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as AttendanceSession) };
}

export async function updateSessionStatus(
  sessionId: string,
  status: "draft" | "open" | "locked",
  userId?: string,
) {
  const updates: Partial<AttendanceSession> = { status };
  if (status === "locked" && userId) {
    updates.lockedAt = new Date().toISOString();
    updates.lockedBy = userId;
  }
  await updateDoc(doc(db, "attendanceSessions", sessionId), updates);
}

export async function updateSessionTitle(
  sessionId: string,
  title: string,
  category?: AttendanceCategory,
): Promise<void> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Session title is required");

  const session = await getSession(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status === "locked") {
    throw new Error("Locked session titles cannot be edited");
  }

  const updates: Record<string, unknown> = {
    title: trimmedTitle,
  };
  if (category) updates.category = category;
  await updateDoc(doc(db, "attendanceSessions", sessionId), updates);
}

export async function lockSession(sessionId: string, userId?: string) {
  await updateSessionStatus(sessionId, "locked", userId);
  
  // Recalculate stats for all cadets in this session's division/year
  const sess = await getSession(sessionId);
  if (sess) {
    const cadets = await getCadetsByDivision(sess.divisionId, sess.nccYear);
    await Promise.all(
      cadets.map((c) => recalculateCadetStats(c.id, sess.divisionId, sess.nccYear))
    );
  }
}

export async function updateSessionParadeFlags(
  sessionId: string,
  flags: { paradeCount?: number; isOfficialParade?: boolean },
) {
  const updates: Record<string, unknown> = {};
  if (flags.paradeCount !== undefined) updates.paradeCount = flags.paradeCount;
  if (flags.isOfficialParade !== undefined)
    updates.isOfficialParade = flags.isOfficialParade;
  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(db, "attendanceSessions", sessionId), updates);
  }
}

export async function deleteSession(sessionId: string) {
  // Delete marks subcollection first
  const marksCol = collection(db, "attendanceSessions", sessionId, "marks");
  const marksSnap = await getDocs(marksCol);
  const batch = writeBatch(db);
  marksSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  // Delete session
  await deleteDoc(doc(db, "attendanceSessions", sessionId));
}

// ============ MARKS OPERATIONS ============

export async function listMarks(
  sessionId: string,
): Promise<(AttendanceMark & { id: string })[]> {
  const col = collection(db, "attendanceSessions", sessionId, "marks");
  const snap = await getDocs(col);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AttendanceMark) }));
}

export function listenMarks(
  sessionId: string,
  cb: (items: (AttendanceMark & { id: string })[]) => void,
) {
  const col = collection(db, "attendanceSessions", sessionId, "marks");
  return onSnapshot(col, (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AttendanceMark) }))),
  );
}

export async function getMark(
  sessionId: string,
  cadetId: string,
): Promise<AttendanceMark | null> {
  const ref = doc(db, "attendanceSessions", sessionId, "marks", cadetId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as AttendanceMark) : null;
}

export async function setMark(
  sessionId: string,
  cadetId: string,
  status: AttendanceStatus,
  markedBy: string,
  notes?: string,
) {
  const markRef = doc(db, "attendanceSessions", sessionId, "marks", cadetId);
  const markData: AttendanceMark = {
    cadetId,
    status,
    markedBy,
    markedAt: new Date().toISOString(),
    ...(notes && { notes }),
  };
  await setDoc(markRef, markData, { merge: true });
  // Update session stats
  await updateSessionStats(sessionId);
}

export async function bulkSetMarks(payload: BulkMarkPayload) {
  const { sessionId, marks, markedBy } = payload;
  const batch = writeBatch(db);
  const timestamp = new Date().toISOString();

  marks.forEach(({ cadetId, status }) => {
    const markRef = doc(db, "attendanceSessions", sessionId, "marks", cadetId);
    batch.set(
      markRef,
      {
        cadetId,
        status,
        markedBy,
        markedAt: timestamp,
      },
      { merge: true },
    );
  });

  await batch.commit();
  await updateSessionStats(sessionId);
}

// ============ STATS OPERATIONS ============

export async function updateSessionStats(sessionId: string) {
  const marks = await listMarks(sessionId);
  const stats: SessionStats = {
    total: marks.length,
    present: marks.filter((m) => m.status === "P").length,
    absent: marks.filter((m) => m.status === "A").length,
  };
  await updateDoc(doc(db, "attendanceSessions", sessionId), { stats });
}

export async function getCadetStats(
  cadetId: string,
): Promise<CadetAttendanceStats | null> {
  const snap = await getDoc(doc(db, "cadetAttendanceStats", cadetId));
  return snap.exists() ? (snap.data() as CadetAttendanceStats) : null;
}

export function listenCadetStats(
  cadetId: string,
  cb: (stats: CadetAttendanceStats | null) => void,
) {
  return onSnapshot(doc(db, "cadetAttendanceStats", cadetId), (snap) => {
    cb(snap.exists() ? (snap.data() as CadetAttendanceStats) : null);
  });
}

export async function recalculateCadetStats(
  cadetId: string,
  divisionId: Division,
  nccYear: NccYear,
) {
  // Get all sessions for this division/year
  const sessions = await getSessionsByDivision(divisionId, nccYear);

  let present = 0,
    absent = 0;
  const monthly: Record<
    string,
    { total: number; present: number; absent: number }
  > = {};
  const categoryBreakdown = Object.fromEntries(
    (["Theory Class", "Parade", "Volunteering", "Other"] as AttendanceCategory[]).map(
      (category) => [category, { total: 0, present: 0, absent: 0 }],
    ),
  ) as CadetAttendanceStats["categoryBreakdown"];
  const recentSessionIds: string[] = [];

  for (const session of sessions) {
    const mark = await getMark(session.id!, cadetId);
    if (!mark) continue;

    // Count by status
    if (mark.status === "P") {
      present++;
    } else {
      absent++;
    }

    // Monthly breakdown
    const monthKey = format(new Date(session.date), "yyyy-MM");
    if (!monthly[monthKey]) {
      monthly[monthKey] = { total: 0, present: 0, absent: 0 };
    }
    monthly[monthKey].total++;
    if (mark.status === "P") monthly[monthKey].present++;
    if (mark.status === "A") monthly[monthKey].absent++;

    const categoryStats = categoryBreakdown?.[session.category || "Other"];
    if (categoryStats) {
      categoryStats.total++;
      if (mark.status === "P") categoryStats.present++;
      if (mark.status === "A") categoryStats.absent++;
    }

    // Recent sessions
    if (recentSessionIds.length < 10) {
      recentSessionIds.push(session.id!);
    }
  }

  const totalSessions = present + absent;
  const attendanceRate =
    totalSessions > 0 ? (present / totalSessions) * 100 : 0;

  const stats: CadetAttendanceStats = {
    cadetId,
    divisionId,
    nccYear,
    totalSessions,
    present,
    absent,
    attendanceRate: Math.round(attendanceRate * 10) / 10,
    monthly,
    categoryBreakdown,
    recentSessionIds,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "cadetAttendanceStats", cadetId), stats);
  return stats;
}

// ============ CADET OPERATIONS ============

export async function listCadets(): Promise<(Cadet & { id: string })[]> {
  const snap = await getDocs(collection(db, "users"));

  const normalizeStatus = (value: unknown): string =>
    String(value || "")
      .trim()
      .toLowerCase();

  return snap.docs
    .filter((d) => {
      const data = d.data();
      const status = normalizeStatus(data.status);
      return isCadetUser(data) && status === "active" && data.role !== "alumni";
    })
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: d.id,
        name: data.name || "",
        dateOfBirth: data.dateOfBirth || "",
        email: data.email || "",
        division: data.division || undefined,
        regimentalNumber: data.regimentalNumber || "",
        dateOfEnrollment: data.dateOfEnrollment || "",
        rank: data.rank || "CDT",
        year: data.year || "",
        nccYear: data.nccYear || "",
        department: data.department || "",
        rollNo: data.rollNo || "",
        registerNumber: data.registerNumber || "",
        phone: data.phone || "",
        bloodGroup: data.bloodGroup || "",
        fatherName: data.fatherName || "",
        address: data.address || "",
        residentialStatus: data.residentialStatus || "",
        joinDate: data.createdAt || "",
      } as Cadet & { id: string };
    })
    .sort((a, b) => (a.regimentalNumber || "").localeCompare(b.regimentalNumber || ""));
}

export async function getCadetsByDivision(
  divisionId: Division,
  nccYear?: NccYear,
): Promise<(Cadet & { id: string })[]> {
  const allCadets = await listCadets();
  return allCadets.filter((c) => {
    const divMatch = c.division === divisionId;
    const yearMatch = !nccYear || c.nccYear === nccYear;
    return divMatch && yearMatch;
  });
}

export async function getCadetByUserId(
  userId: string,
): Promise<(Cadet & { id: string }) | null> {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return null;

  const data = userDoc.data();
  if (!isCadetUser(data) || data.status !== "active" || data.role === "alumni") return null;

  return {
    id: userId,
    userId: userId,
    name: data.name || "",
    dateOfBirth: data.dateOfBirth || "",
    email: data.email || "",
    division: data.division || undefined,
    regimentalNumber: data.regimentalNumber || "",
    dateOfEnrollment: data.dateOfEnrollment || "",
    rank: data.rank || "CDT",
    year: data.year || "",
    nccYear: data.nccYear || "",
    department: data.department || "",
    rollNo: data.rollNo || "",
    registerNumber: data.registerNumber || "",
    phone: data.phone || "",
    bloodGroup: data.bloodGroup || "",
    address: data.address || "",
    joinDate: data.createdAt || "",
  } as Cadet & { id: string };
}

// ============ USER ATTENDANCE VIEW ============

export async function getUserAttendanceHistory(
  cadetId: string,
  divisionId?: Division,
  nccYear?: NccYear,
): Promise<
  Array<{
    session: AttendanceSession & { id: string };
    mark: AttendanceMark | null;
  }>
> {
  let sessions: (AttendanceSession & { id: string })[];
  if (divisionId && nccYear) {
    sessions = await getSessionsByDivision(divisionId, nccYear);
  } else {
    sessions = await listSessions();
  }

  const result = await Promise.all(
    sessions.map(async (session) => {
      const mark = await getMark(session.id!, cadetId);
      return { session, mark };
    }),
  );

  return result.filter((item) => item.mark !== null);
}

export async function cleanupLegacySessionFields(): Promise<number> {
  const snap = await getDocs(sessionsCol);
  let updatedCount = 0;

  for (const sessionDoc of snap.docs) {
    const data = sessionDoc.data() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if ("type" in data) {
      updates.type = deleteField();
    }
    if ("location" in data) {
      updates.location = deleteField();
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(sessionDoc.ref, updates);
      updatedCount++;
    }
  }

  return updatedCount;
}

// ============ PARADE STATE HELPERS ============

export interface AnoUser {
  uid: string;
  name: string;
  email: string;
  rank?: string;
}

/**
 * Get all locked official parade sessions for a specific date.
 * Returns sessions with their marks pre-loaded.
 */
export async function getLockedOfficialSessionsByDate(date: string): Promise<
  Array<{
    session: AttendanceSession & { id: string };
    marks: (AttendanceMark & { id: string })[];
  }>
> {
  const q = query(
    sessionsCol,
    where("date", "==", date),
    where("status", "==", "locked"),
    where("isOfficialParade", "==", true),
  );
  const snap = await getDocs(q);
  const sessions = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as AttendanceSession),
  }));

  const results = await Promise.all(
    sessions.map(async (session) => {
      const marks = await listMarks(session.id);
      return { session, marks };
    }),
  );

  return results;
}

/**
 * List all active ANO users from the users collection.
 */
export async function listAnoUsers(): Promise<AnoUser[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .filter((d) => {
      const data = d.data();
      const type = String(data.userType || "").toLowerCase();
      const role = String(data.role || "").toLowerCase();
      const isAnoOrAdmin =
        type === "ano" || type === "super-admin" || role === "super-admin";
      return (
        isAnoOrAdmin &&
        String(data.status || "")
          .trim()
          .toLowerCase() === "active"
      );
    })
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        name: data.name || "",
        email: data.email || "",
        rank: data.rank || "",
      };
    });
}
