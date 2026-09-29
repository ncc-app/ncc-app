import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setDoc, doc } from "firebase/firestore";
import { FIREBASE_CONFIG } from "./src/shared/config/firebase.ts";
import { getCadetsByDivision, recalculateCadetStats, getSessionsByDivision } from "./src/features/attendance/service.ts";

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

async function backfill() {
  console.log("Fetching all cadets...");
  const snap = await getDocs(collection(db, "users"));
  const activeCadets = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.status === "active" && (!d.userType || d.userType === "cadet"));
  
  console.log(`Found ${activeCadets.length} active cadets.`);
  
  let count = 0;
  for (const c of activeCadets) {
    if (!c.division || !c.nccYear) continue;
    await recalculateCadetStats(c.id, c.division, c.nccYear);
    count++;
    if (count % 10 === 0) console.log(`Processed ${count}...`);
  }
  
  console.log("Done!");
}

backfill().then(() => process.exit(0)).catch(console.error);
