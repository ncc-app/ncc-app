#!/usr/bin/env node
// =============================================================================
// year-rollover.mjs — NCC Cadet Yearly Rollover Script
//
// Promotes cadets to the next academic/NCC year, archives those who have
// completed their NCC tenure or graduated, and cleans up expired alumni.
//
// Usage:
//   node scripts/year-rollover.mjs              # Execute rollover
//   node scripts/year-rollover.mjs --dry-run    # Preview only, no writes
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  — JSON string of the Firebase service account key
// =============================================================================

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Firebase initialisation
// ---------------------------------------------------------------------------

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (err) {
  console.error(
    "❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:",
    err.message,
  );
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACADEMIC_YEARS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
];
const NCC_YEARS = ["1st Year", "2nd Year", "3rd Year"];

let FIVE_YEAR_DEPARTMENTS = ["ARCH", "AMCS"];
try {
  const constantsPath = path.join(
    process.cwd(),
    "src/shared/config/constants.ts",
  );
  const content = fs.readFileSync(constantsPath, "utf8");
  const regex =
    /code:\s*['"]([^'"]+)['"],\s*name:\s*['"][^'"]+['"],\s*courseTenure:\s*5/g;
  const matches = [...content.matchAll(regex)].map((m) => m[1]);
  if (matches.length > 0) {
    FIVE_YEAR_DEPARTMENTS = matches;
  }
} catch (err) {
  console.warn(
    "⚠️ Could not dynamically read 5-year departments, falling back to default.",
  );
}

const DEFAULT_CONFIG = {};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function getNextAcademicYear(current) {
  const idx = ACADEMIC_YEARS.indexOf(current);
  if (idx === -1 || idx === ACADEMIC_YEARS.length - 1) return null;
  return ACADEMIC_YEARS[idx + 1];
}

function getNextNccYear(current) {
  const idx = NCC_YEARS.indexOf(current);
  if (idx === -1 || idx === NCC_YEARS.length - 1) return null;
  return NCC_YEARS[idx + 1];
}

function getMaxAcademicYear(department) {
  return FIVE_YEAR_DEPARTMENTS.includes(department) ? "5th Year" : "4th Year";
}

function isAcademicComplete(year, department) {
  return year === getMaxAcademicYear(department);
}

function isNccComplete(nccYear) {
  return nccYear === "3rd Year";
}

// ---------------------------------------------------------------------------
// Main rollover logic
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("  NCC Year Rollover");
  console.log(
    `  Mode: ${DRY_RUN ? "🔍 DRY RUN (no changes will be made)" : "🚀 LIVE EXECUTION"}`,
  );
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log("=".repeat(60));
  console.log();

  // 1. Load app config
  console.log("📋 Loading app config from settings/appConfig …");
  const configSnap = await db.doc("settings/appConfig").get();
  const config = configSnap.exists
    ? { ...DEFAULT_CONFIG, ...configSnap.data() }
    : { ...DEFAULT_CONFIG };

  console.log(`   5-year depts     : ${FIVE_YEAR_DEPARTMENTS.join(", ")}`);
  console.log();

  // 1.5 Execution Mode
  if (DRY_RUN) {
    console.log("🧑‍💻 Triggered manually as DRY RUN (preview only).");
  } else {
    console.log("🧑‍💻 Triggered for FULL EXECUTION.");
  }

  // 2. Read all users & alumni
  console.log("📖 Fetching all users and alumni from Firestore...");
  const usersSnap = await db.collection("users").get();
  const alumniSnap = await db.collection("alumni").get();
  console.log(
    `   Found ${usersSnap.size} active users, ${alumniSnap.size} existing alumni.`,
  );

  // 3. Build plan
  console.log("🧠 Building rollover plan...");
  const plan = [];
  const counts = {
    skip: 0,
    alumni_ncc: 0,
    delete_graduated_cadet: 0,
    delete_graduated_alumni: 0,
    increment: 0,
    increment_alumni: 0,
  };

  // 3a. Process active users
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const uid = userDoc.id;

    const userRole = data.role || "member";

    const userType = data.userType || "cadet"; // Default to cadet if missing

    // Skip ANOs (roll over all cadets regardless of their role)
    if (userType === "ano") {
      plan.push({
        uid,
        name: data.name || uid,
        action: "skip",
        reason: "ANO — not touched",
        data,
        userRole,
      });
      counts.skip++;
      continue;
    }

    const year = data.year || "";
    const nccYear = data.nccYear || "";
    const dept = data.department || "";

    const isAcademicDone = isAcademicComplete(year, dept);
    const isNccDone = isNccComplete(nccYear);

    const newYear = getNextAcademicYear(year) || year;
    const newNccYear = getNextNccYear(nccYear) || nccYear;

    // RULE 1: If Academic tenure is complete, completely deleted from the app.
    if (isAcademicDone) {
      plan.push({
        uid,
        name: data.name || uid,
        action: "delete_graduated_cadet",
        reason: `Academic ${year} complete → delete from app`,
        data,
        userRole,
      });
      counts.delete_graduated_cadet++;
      continue;
    }

    // RULE 2: If NCC tenure is complete (but still in college)
    if (isNccDone) {
      // Move entirely to Alumni collection, increment academic year
      plan.push({
        uid,
        name: data.name || uid,
        action: "alumni_ncc",
        reason: `NCC complete → move to alumni collection, promote to ${newYear}`,
        newYear,
        data,
        userRole,
      });
      counts.alumni_ncc++;
      continue;
    }

    // RULE 3: Still active in both, increment both.
    plan.push({
      uid,
      name: data.name || uid,
      action: "increment",
      reason: `${year} → ${newYear}, NCC ${nccYear} → ${newNccYear}`,
      newYear,
      newNccYear,
      data,
      userRole,
    });
    counts.increment++;
  }

  // 3b. Process existing Alumni
  for (const alumniDoc of alumniSnap.docs) {
    const data = alumniDoc.data();
    const uid = alumniDoc.id;
    const year = data.year || "";
    const dept = data.department || "";

    const isAcademicDone = isAcademicComplete(year, dept);
    const newYear = getNextAcademicYear(year) || year;

    if (isAcademicDone) {
      plan.push({
        uid,
        name: data.name || uid,
        action: "delete_graduated_alumni",
        reason: `Alumni Academic ${year} complete → delete from app`,
        data,
        userRole: "alumni",
      });
      counts.delete_graduated_alumni++;
    } else {
      plan.push({
        uid,
        name: data.name || uid,
        action: "increment_alumni",
        reason: `Alumni staying in college → promote to ${newYear}`,
        newYear,
        data,
        userRole: "alumni",
      });
      counts.increment_alumni++;
    }
  }

  // 4. Print plan
  console.log("\nDetailed plan:");
  plan.forEach((item, i) => {
    console.log(
      `    ${String(i + 1).padStart(2, " ")}. ${item.name.padEnd(25, " ")} | ${String(item.action).padEnd(25, " ")} | ${item.reason}`,
    );
  });

  console.log("\n─".repeat(30));
  console.log(`   ⏩ Increment Cadets          : ${counts.increment}`);
  console.log(`   🎓 Move to Alumni            : ${counts.alumni_ncc}`);
  console.log(`   ⏩ Increment Alumni          : ${counts.increment_alumni}`);
  console.log(
    `   🗑️  Delete Graduated Cadets   : ${counts.delete_graduated_cadet}`,
  );
  console.log(
    `   🗑️  Delete Graduated Alumni   : ${counts.delete_graduated_alumni}`,
  );
  console.log(`   ⏭️  Skip (ANO)                : ${counts.skip}`);
  console.log(`   ─── Total                     : ${plan.length}`);
  console.log("─".repeat(30));

  // 5. Execution guard
  if (DRY_RUN) {
    console.log("\n✅ Dry run complete. No changes were made.");
    process.exit(0);
  }

  console.log("\n⏳ Beginning execution phase...");

  // 6. Generate execution summary
  const snapshotId = new Date().toISOString().replace(/[:.]/g, "-");

  const summary = {
    incremented: counts.increment,
    alumniNcc: counts.alumni_ncc,
    deletedGraduated:
      counts.delete_graduated_cadet + counts.delete_graduated_alumni,
    skipped: counts.skip,
    timestamp: new Date().toISOString(),
  };

  // 7. Apply changes using batched writes (max 500 per batch)
  console.log("🔄 Applying changes …");

  const actionItems = plan.filter((p) => p.action !== "skip");
  const MAX_BATCH_OPS = 50; // Max users per batch (each user may trigger up to 7 ops; 50 * 7 = 350, safely under Firestore limit of 500)

  for (let i = 0; i < actionItems.length; i += MAX_BATCH_OPS) {
    const chunk = actionItems.slice(i, i + MAX_BATCH_OPS);
    const batch = db.batch();

    for (const item of chunk) {
      const userRef = db.doc(`users/${item.uid}`);
      const cadetRef = db.doc(`cadets/${item.uid}`);
      const alumniRef = db.doc(`alumni/${item.uid}`);
      const userData = item.data || {};

      switch (item.action) {
        case "alumni_ncc": {
          // Move from active cadet to alumni role
          batch.set(
            userRef,
            {
              role: "alumni",
              year: item.newYear,
            },
            { merge: true },
          );

          batch.delete(cadetRef);

          // Free up taken numbers
          const regId = userData.regimentalNumber
            ? `regimentalNumber_${userData.regimentalNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`
            : null;
          const regNumId = userData.registerNumber
            ? `registerNumber_${userData.registerNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`
            : null;
          const rollId = userData.rollNo
            ? `rollNo_${userData.rollNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`
            : null;
          if (regId) batch.delete(db.doc(`takenNumbers/${regId}`));
          if (regNumId) batch.delete(db.doc(`takenNumbers/${regNumId}`));
          if (rollId) batch.delete(db.doc(`takenNumbers/${rollId}`));

          break;
        }

        case "increment_alumni": {
          batch.set(
            alumniRef,
            {
              year: item.newYear,
            },
            { merge: true },
          );
          break;
        }

        case "delete_graduated_cadet": {
          const {
            uid: _uid2,
            _snapshotSource: _src2,
            ...alumniData2
          } = userData;
          const is5Year2 = ["ARCH", "AMCS"].includes(alumniData2.department);
          const courseDuration2 = is5Year2 ? 5 : 4;

          let academicYear2 = "";
          if (alumniData2.year) {
            let numericYear = 99;
            const lower = alumniData2.year.toLowerCase();
            if (lower.includes("1") || lower.includes("i ")) numericYear = 1;
            else if (lower.includes("2") || lower.includes("ii"))
              numericYear = 2;
            else if (lower.includes("3") || lower.includes("iii"))
              numericYear = 3;
            else if (lower.includes("4") || lower.includes("iv"))
              numericYear = 4;
            else if (lower.includes("5") || lower.includes("v"))
              numericYear = 5;

            if (numericYear <= 5) {
              const now = new Date();
              const currentAcademicYearEnd =
                now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1;
              const startYear = currentAcademicYearEnd - numericYear;
              academicYear2 = `${startYear}-${startYear + courseDuration2}`;
            }
          }

          const enrollYear2 = alumniData2.dateOfEnrollment
            ? new Date(alumniData2.dateOfEnrollment).getFullYear()
            : null;
          let nccTenure2 = "";
          if (enrollYear2 && !isNaN(enrollYear2)) {
            nccTenure2 = `${enrollYear2}-${enrollYear2 + 3}`;
          }

          batch.set(db.doc(`alumniProfiles/${item.uid}`), {
            name: alumniData2.name || "Unknown",
            email: alumniData2.email || null,
            phone: alumniData2.phone || null,
            bloodGroup: alumniData2.bloodGroup || null,
            division: alumniData2.division || null,
            department: alumniData2.department || null,
            academicYear: academicYear2 || null,
            nccTenure: nccTenure2 || null,
            rank: alumniData2.rank || "CDT",
            achievements: alumniData2.achievements || null,
            regimentalNumber: alumniData2.regimentalNumber || null,
            nccYear: alumniData2.nccYear || null,
            year: alumniData2.year || null,
            photoURL: alumniData2.photoURL || null,
            cloudinaryPublicId: alumniData2.cloudinaryPublicId || null,
            status: "active",
            visible: true,
            source: "rollover",
            createdBy: "rollover-script",
            createdAt: new Date().toISOString(),
            archivedAt: new Date().toISOString(),
            reasonForArchival: "academic_complete",
          });

          batch.delete(userRef);
          batch.delete(cadetRef);
          // Queue auth deletion
          batch.set(db.doc(`pendingAuthDeletions/${item.uid}`), {
            email: userData.email || "",
            deletedBy: "rollover-script",
            deletedAt: new Date().toISOString(),
            reason: "academic_complete_rollover",
          });

          // Free up taken numbers
          const regId = userData.regimentalNumber
            ? `regimentalNumber_${userData.regimentalNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`
            : null;
          const regNumId = userData.registerNumber
            ? `registerNumber_${userData.registerNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`
            : null;
          const rollId = userData.rollNo
            ? `rollNo_${userData.rollNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`
            : null;
          if (regId) batch.delete(db.doc(`takenNumbers/${regId}`));
          if (regNumId) batch.delete(db.doc(`takenNumbers/${regNumId}`));
          if (rollId) batch.delete(db.doc(`takenNumbers/${rollId}`));
          break;
        }

        case "delete_graduated_alumni": {
          const {
            uid: _uid3,
            _snapshotSource: _src3,
            ...alumniData3
          } = userData;
          const is5Year3 = ["ARCH", "AMCS"].includes(alumniData3.department);
          const courseDuration3 = is5Year3 ? 5 : 4;

          let academicYear3 = "";
          if (alumniData3.year) {
            let numericYear = 99;
            const lower = alumniData3.year.toLowerCase();
            if (lower.includes("1") || lower.includes("i ")) numericYear = 1;
            else if (lower.includes("2") || lower.includes("ii"))
              numericYear = 2;
            else if (lower.includes("3") || lower.includes("iii"))
              numericYear = 3;
            else if (lower.includes("4") || lower.includes("iv"))
              numericYear = 4;
            else if (lower.includes("5") || lower.includes("v"))
              numericYear = 5;

            if (numericYear <= 5) {
              const now = new Date();
              const currentAcademicYearEnd =
                now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1;
              const startYear = currentAcademicYearEnd - numericYear;
              academicYear3 = `${startYear}-${startYear + courseDuration3}`;
            }
          }

          const enrollYear3 = alumniData3.dateOfEnrollment
            ? new Date(alumniData3.dateOfEnrollment).getFullYear()
            : null;
          let nccTenure3 = "";
          if (enrollYear3 && !isNaN(enrollYear3)) {
            nccTenure3 = `${enrollYear3}-${enrollYear3 + 3}`;
          }

          batch.set(db.doc(`alumniProfiles/${item.uid}`), {
            name: alumniData3.name || "Unknown",
            email: alumniData3.email || null,
            phone: alumniData3.phone || null,
            bloodGroup: alumniData3.bloodGroup || null,
            division: alumniData3.division || null,
            department: alumniData3.department || null,
            academicYear: academicYear3 || null,
            nccTenure: nccTenure3 || null,
            rank: alumniData3.rank || "CDT",
            achievements: alumniData3.achievements || null,
            regimentalNumber: alumniData3.regimentalNumber || null,
            nccYear: alumniData3.nccYear || null,
            year: alumniData3.year || null,
            photoURL: alumniData3.photoURL || null,
            cloudinaryPublicId: alumniData3.cloudinaryPublicId || null,
            status: "active",
            visible: true,
            source: "rollover",
            createdBy: "rollover-script",
            createdAt: new Date().toISOString(),
            archivedAt: new Date().toISOString(),
            reasonForArchival: "academic_complete",
          });

          batch.delete(alumniRef);
          // Queue auth deletion
          batch.set(db.doc(`pendingAuthDeletions/${item.uid}`), {
            email: userData.email || "",
            deletedBy: "rollover-script",
            deletedAt: new Date().toISOString(),
            reason: "alumni_academic_complete_rollover",
          });
          break;
        }

        case "increment": {
          batch.set(
            userRef,
            {
              year: item.newYear,
              nccYear: item.newNccYear,
            },
            { merge: true },
          );
          break;
        }
      }
    }

    await batch.commit();
    console.log(`   ✓ Batch ${Math.floor(i / MAX_BATCH_OPS) + 1} committed.`);
  }

  // 8. Clear Attendance Records
  console.log("🧹 Clearing attendance records for the new year …");
  try {
    const collectionsToClear = ["attendanceSessions", "cadetAttendanceStats"];
    for (const col of collectionsToClear) {
      const snap = await db.collection(col).get();
      if (!snap.empty) {
        for (let i = 0; i < snap.size; i += MAX_BATCH_OPS) {
          const chunk = snap.docs.slice(i, i + MAX_BATCH_OPS);
          const batch = db.batch();
          chunk.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
        console.log(`   ✓ Cleared ${snap.size} documents from ${col}.`);
      }
    }
  } catch (err) {
    console.error("   ⚠️ Error clearing attendance:", err.message);
  }

  // 8b. Clear Event Drive Records
  console.log("🧹 Clearing event drive records for the new year …");
  try {
    const drivesSnap = await db.collection("eventDrives").get();
    if (!drivesSnap.empty) {
      for (const driveDoc of drivesSnap.docs) {
        // Delete responses subcollection first
        const responsesSnap = await driveDoc.ref
          .collection("responses")
          .get();
        if (!responsesSnap.empty) {
          for (let i = 0; i < responsesSnap.size; i += MAX_BATCH_OPS) {
            const chunk = responsesSnap.docs.slice(i, i + MAX_BATCH_OPS);
            const batch = db.batch();
            chunk.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
          }
        }
      }
      // Delete drive documents
      for (let i = 0; i < drivesSnap.size; i += MAX_BATCH_OPS) {
        const chunk = drivesSnap.docs.slice(i, i + MAX_BATCH_OPS);
        const batch = db.batch();
        chunk.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
      console.log(
        `   ✓ Cleared ${drivesSnap.size} event drives and their responses.`,
      );
    } else {
      console.log("   ✓ No event drives to clear.");
    }
  } catch (err) {
    console.error("   ⚠️ Error clearing event drives:", err.message);
  }

  // 9. Update settings
  console.log("📝 Updating appConfig...");
  let nextRolloverDateStr = config.nextRolloverDate || "";
  if (nextRolloverDateStr) {
    const d = new Date(nextRolloverDateStr);
    if (!isNaN(d.getTime())) {
      d.setFullYear(d.getFullYear() + 1);
      nextRolloverDateStr = d.toISOString();
    }
  }

  await db.doc("settings/appConfig").set(
    {
      lastRolloverAt: new Date().toISOString(),
      lastRolloverSummary: summary,
      rolloverCompletedForTarget: false, // Reset for next year!
      nextRolloverDate: nextRolloverDateStr, // Advanced by 1 year
    },
    { merge: true },
  );
  console.log(
    `   ✓ Next rollover date automatically set to ${nextRolloverDateStr}`,
  );

  console.log();
  console.log("🎉 Rollover complete!");
}

main().catch((err) => {
  console.error("\n❌ Fatal Error during rollover execution:");
  console.error(err);
  process.exit(1);
});
