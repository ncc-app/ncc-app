import { db } from "@/shared/config/firebase";
import type { EventDrive } from "@/shared/types";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const drivesCol = collection(db, "eventDrives");

// ============ CREATE ============

export interface CreateDriveData {
  title: string;
  description?: string;
  driveType: string;
  customDriveType?: string;
  targetDivision: "SD" | "SW";
  targetNccYear: string;
  date: string;
  location?: string;
  capacity?: number | null;
  deadline: string;
  createdBy: string;
}

export async function createDrive(data: CreateDriveData): Promise<string> {
  const now = new Date().toISOString();
  const driveDoc = {
    ...data,
    status: "open",
    createdAt: now,
    updatedAt: now,
    stats: { optedIn: 0, optedOut: 0, noResponse: 0 },
  };
  const ref = await addDoc(drivesCol, driveDoc);
  return ref.id;
}

// ============ UPDATE ============

export async function updateDrive(
  driveId: string,
  data: Partial<
    Pick<
      EventDrive,
      | "title"
      | "description"
      | "driveType"
      | "customDriveType"
      | "targetDivision"
      | "targetNccYear"
      | "date"
      | "location"
      | "capacity"
      | "deadline"
    >
  >,
): Promise<void> {
  const ref = doc(db, "eventDrives", driveId);
  await updateDoc(ref, { ...data, updatedAt: new Date().toISOString() });
}

// ============ STATUS MANAGEMENT ============

export async function closeDrive(driveId: string): Promise<void> {
  const ref = doc(db, "eventDrives", driveId);
  await updateDoc(ref, {
    status: "closed",
    updatedAt: new Date().toISOString(),
  });
}

export async function reopenDrive(driveId: string): Promise<void> {
  const ref = doc(db, "eventDrives", driveId);
  await updateDoc(ref, {
    status: "open",
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Auto-close all open drives whose deadline has passed.
 * Called when the admin views the management page to ensure
 * expired drives are reflected accurately.
 */
export async function autoCloseExpiredDrives(): Promise<void> {
  const q = query(drivesCol, where("status", "==", "open"));
  const snap = await getDocs(q);
  const now = new Date();
  const batch = writeBatch(db);
  let count = 0;

  for (const d of snap.docs) {
    const deadline = d.data().deadline;
    if (deadline && new Date(deadline) < now) {
      batch.update(d.ref, {
        status: "closed",
        updatedAt: now.toISOString(),
      });
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

// ============ DELETE ============

export async function deleteDrive(driveId: string): Promise<void> {
  // Delete all responses in subcollection first
  const responsesCol = collection(db, "eventDrives", driveId, "responses");
  const responsesSnap = await getDocs(responsesCol);
  const deletePromises = responsesSnap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);

  // Delete the drive document
  await deleteDoc(doc(db, "eventDrives", driveId));
}

// ============ READ ============

export async function getDrives(
  status?: "open" | "closed",
): Promise<(EventDrive & { id: string })[]> {
  let q;
  if (status) {
    q = query(
      drivesCol,
      where("status", "==", status),
      orderBy("createdAt", "desc"),
    );
  } else {
    q = query(drivesCol, orderBy("createdAt", "desc"));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as EventDrive),
  }));
}

export async function getDriveById(
  driveId: string,
): Promise<(EventDrive & { id: string }) | null> {
  const ref = doc(db, "eventDrives", driveId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as EventDrive) };
}

export function listenDrives(
  cb: (items: (EventDrive & { id: string })[]) => void,
) {
  const q = query(drivesCol, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as EventDrive) })),
    );
  });
}

// ============ STATS UPDATE ============

export async function updateDriveStats(
  driveId: string,
  stats: { optedIn: number; optedOut: number; noResponse: number },
): Promise<void> {
  const ref = doc(db, "eventDrives", driveId);
  await updateDoc(ref, {
    stats,
    updatedAt: new Date().toISOString(),
  });
}
