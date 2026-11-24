/**
 * Cloudinary Cleanup Script
 *
 * This script is run by the GitHub Action (.github/workflows/cloudinary-cleanup.yml)
 * every night at midnight IST.
 *
 * It reads the `cloudinary_cleanup` collection from Firestore, deletes each
 * referenced file from Cloudinary using the Admin API, and then removes the
 * Firestore document from the queue.
 *
 * Required environment variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * - FIREBASE_SERVICE_ACCOUNT (JSON string of the Firebase service account key)
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ─── Firebase Admin Initialization ───────────────────────────────────────────

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

// ─── Cloudinary Admin API ────────────────────────────────────────────────────

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("❌ Missing Cloudinary environment variables.");
  process.exit(1);
}

/**
 * Delete a resource from Cloudinary by its public_id using the Admin API.
 */
async function deleteFromCloudinary(publicId, resourceType = "image") {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${resourceType}/upload`;

  const formData = new URLSearchParams();
  formData.append("public_ids", publicId);

  const authHeader =
    "Basic " + Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const result = await response.json();
  return result;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🧹 Starting Cloudinary cleanup...");

  const snapshot = await db.collection("cloudinary_cleanup").get();

  if (snapshot.empty) {
    console.log("✅ No files to clean up. Queue is empty.");
    return;
  }

  console.log(`📋 Found ${snapshot.size} file(s) to delete.`);

  let successCount = 0;
  let failCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const publicId = data.publicId;
    const resourceType = data.resourceType || "image";

    if (!publicId) {
      console.warn(`⚠️ Skipping doc ${doc.id}: no publicId found.`);
      await doc.ref.delete();
      continue;
    }

    try {
      const result = await deleteFromCloudinary(publicId, resourceType);

      const status = result.deleted?.[publicId];

      if (status === "deleted" || status === "not_found") {
        console.log(`✅ Deleted: ${publicId} (${status})`);
        await doc.ref.delete();
        successCount++;
      } else {
        console.error(`❌ Failed to delete ${publicId}:`, result);
        failCount++;
      }
    } catch (err) {
      console.error(`❌ Error deleting ${publicId}:`, err.message);
      failCount++;
    }
  }

  console.log(
    `\n🏁 Cleanup complete: ${successCount} deleted, ${failCount} failed.`,
  );
}

main().catch((err) => {
  console.error("❌ Cleanup script failed:", err);
  process.exit(1);
});
