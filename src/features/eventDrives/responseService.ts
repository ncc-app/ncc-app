import { db } from "@/shared/config/firebase";
import type { DriveResponse } from "@/shared/types";
import type { DriveResponseType } from "@/shared/config/constants";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
} from "firebase/firestore";
import { updateDriveStats } from "./eventDriveService";

// ============ SUBMIT / UPDATE RESPONSE ============

export interface SubmitResponseData {
  cadetUid: string;
  cadetName: string;
  division: "SD" | "SW";
  nccYear: string;
  response: DriveResponseType;
  reason?: string;
}

export async function submitResponse(
  driveId: string,
  data: SubmitResponseData,
): Promise<void> {
  const responseRef = doc(
    db,
    "eventDrives",
    driveId,
    "responses",
    data.cadetUid,
  );
  await setDoc(responseRef, {
    ...data,
    respondedAt: new Date().toISOString(),
  });
}

// ============ READ RESPONSES ============

export async function getResponses(
  driveId: string,
): Promise<DriveResponse[]> {
  const responsesCol = collection(
    db,
    "eventDrives",
    driveId,
    "responses",
  );
  const snap = await getDocs(responsesCol);
  return snap.docs.map((d) => d.data() as DriveResponse);
}

export async function getMyResponse(
  driveId: string,
  cadetUid: string,
): Promise<DriveResponse | null> {
  const responseRef = doc(
    db,
    "eventDrives",
    driveId,
    "responses",
    cadetUid,
  );
  const snap = await getDoc(responseRef);
  if (!snap.exists()) return null;
  return snap.data() as DriveResponse;
}

// ============ ELIGIBLE CADETS WITH RESPONSES ============

export interface CadetWithResponse {
  uid: string;
  name: string;
  division: "SD" | "SW";
  nccYear: string;
  department?: string;
  registerNumber?: string;
  regimentalNumber?: string;
  phone?: string;
  rank?: string;
  response: DriveResponseType | "no_response";
  reason?: string;
  respondedAt?: string;
}

/**
 * Fetches all cadets matching the drive's target criteria and left-joins
 * their responses. Cadets without a response are flagged as "no_response".
 */
export async function getEligibleCadetsWithResponses(
  driveId: string,
  targetDivision: "SD" | "SW",
  targetNccYear: string,
): Promise<CadetWithResponse[]> {
  // Fetch all active cadets matching year + division
  const usersCol = collection(db, "users");

  const q = query(
    usersCol,
    where("status", "==", "active"),
    where("division", "==", targetDivision),
    where("nccYear", "==", targetNccYear),
  );
  const snap = await getDocs(q);

  const cadets: { uid: string; name: string; division: "SD" | "SW"; nccYear: string; department?: string; registerNumber?: string; regimentalNumber?: string; phone?: string; rank?: string }[] = [];

  for (const d of snap.docs) {
    const data = d.data();
    // Only include cadets (not ANOs, not Alumni)
    if (data.userType === "ano" || data.role === "alumni") continue;
    cadets.push({
      uid: d.id,
      name: data.name || "",
      division: data.division || "SD",
      nccYear: data.nccYear || "",
      department: data.department,
      registerNumber: data.registerNumber,
      regimentalNumber: data.regimentalNumber,
      phone: data.phone,
      rank: data.rank,
    });
  }

  // Sort cadets by regimental number
  cadets.sort((a, b) => {
    const numA = a.regimentalNumber || "";
    const numB = b.regimentalNumber || "";
    return numA.localeCompare(numB);
  });

  // Fetch all responses for this drive
  const responses = await getResponses(driveId);
  const responseMap = new Map<string, DriveResponse>();
  for (const r of responses) {
    responseMap.set(r.cadetUid, r);
  }

  // Left-join: merge cadets with their responses
  const result: CadetWithResponse[] = cadets.map((cadet) => {
    const resp = responseMap.get(cadet.uid);
    return {
      ...cadet,
      response: resp?.response ?? "no_response",
      reason: resp?.reason,
      respondedAt: resp?.respondedAt,
    };
  });

  // Sort by name
  result.sort((a, b) => a.name.localeCompare(b.name));

  // Update drive stats
  const optedIn = result.filter((r) => r.response === "opted_in").length;
  const optedOut = result.filter((r) => r.response === "opted_out").length;
  const noResponse = result.filter((r) => r.response === "no_response").length;
  await updateDriveStats(driveId, { optedIn, optedOut, noResponse });

  return result;
}
