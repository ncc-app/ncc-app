import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!serviceAccount.project_id) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT. Please set the environment variable.");
  process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

function calculateTenure(dateOfEnrollment) {
  const date = new Date(dateOfEnrollment);
  const enrollYear = date.getFullYear();
  return `${enrollYear}-${enrollYear + 3}`;
}

async function findMismatched() {
  const snapshot = await db.collection('users').get();
  console.log(`Checking ${snapshot.size} users...\n`);
  
  let mismatchCount = 0;
  
  snapshot.docs.forEach(doc => {
    const user = doc.data();
    
    // Only care about cadets with a photo
    if (user.role === 'member' && user.cloudinaryPublicId && user.dateOfEnrollment && user.division) {
      const tenure = calculateTenure(user.dateOfEnrollment);
      const expectedPrefix = `ncc_assets/profiles/cadets/${tenure}/${user.division}/`;
      
      if (!user.cloudinaryPublicId.startsWith(expectedPrefix)) {
        console.log(`Mismatch Found:`);
        console.log(`  Name: ${user.name}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  Current Location: ${user.cloudinaryPublicId}`);
        console.log(`  Expected Location: ${expectedPrefix}`);
        console.log(`--------------------------------------------------`);
        mismatchCount++;
      }
    }
  });
  
  console.log(`\nFound ${mismatchCount} cadets with photos in mismatched folders.`);
  process.exit(0);
}

findMismatched().catch(console.error);
