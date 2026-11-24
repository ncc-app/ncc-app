import type { User as FirebaseUser, UserCredential } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import toast from "react-hot-toast";
import { UserRole } from "@/shared/config/constants";
import { auth, db } from "@/shared/config/firebase";
import { User } from "@/shared/types";
import { mapFirebaseAuthError } from "@/shared/utils/firebaseErrors";

interface SignUpData {
  name: string;
  role: UserRole;
  email?: string;
  dateOfBirth?: string;
  registerNumber?: string;
  division?: string;
  regimentalNumber?: string;
  dateOfEnrollment?: string;
  rank?: string;
  year?: string;
  department?: string;
  rollNo?: string;
  phone?: string;
  bloodGroup?: string;
  address?: string;
}

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: User | null;
  loading: boolean;
  profileLoading: boolean;
  networkError: boolean;
  retryProfileFetch: () => Promise<User | null>;
  signUp: (
    email: string,
    password: string,
    userData: SignUpData,
  ) => Promise<FirebaseUser>;
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signInWithGoogle: () => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  isAlumni: () => boolean;

  isMember: () => boolean;
  isCadet: () => boolean; // back-compat helper
  fetchUserProfile: (uid: string) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const SESSION_CACHE_KEY = "ncc_user_profile";

const getCachedProfile = (): User | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

const cacheProfile = (profile: User | null) => {
  try {
    if (profile) {
      sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(profile));
    } else {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
    }
  } catch (e) {
    console.warn("Failed to cache profile in sessionStorage", e);
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(() => getCachedProfile());
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  // Fetch user profile from Firestore (with retry for slow networks)
  const fetchUserProfile = async (uid: string, retries = 2): Promise<User | null> => {
    let lastError: any = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let userDoc = await getDoc(doc(db, "users", uid));

        // If not in users, check alumni collection
        if (!userDoc.exists()) {
          userDoc = await getDoc(doc(db, "alumni", uid));
        }

        if (userDoc.exists()) {
          const data = userDoc.data() as Partial<User>;
          const normalized = {
            uid: data.uid || uid,
            ...data,
          } as User;
          setUserProfile(normalized);
          cacheProfile(normalized);
          setNetworkError(false);
          return normalized;
        }
        // Document confirmed does not exist in users or alumni
        setUserProfile(null);
        cacheProfile(null);
        setNetworkError(false);
        return null;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          console.warn(`Profile fetch attempt ${attempt + 1} failed, retrying...`, error);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }
    console.error("Error fetching user profile after retries:", lastError);
    // Don't wipe cached userProfile if network failed; re-throw so callers know it was a network failure
    throw lastError || new Error("Failed to fetch user profile due to network issue");
  };

  const retryProfileFetch = async (): Promise<User | null> => {
    if (!currentUser) return null;
    setProfileLoading(true);
    setNetworkError(false);
    try {
      const p = await fetchUserProfile(currentUser.uid);
      setProfileLoading(false);
      return p;
    } catch (e) {
      setNetworkError(true);
      setProfileLoading(false);
      return null;
    }
  };

  // Sign up
  const signUp = async (
    email: string,
    password: string,
    userData: SignUpData,
  ): Promise<FirebaseUser> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      // Best-effort display name update (do not fail signup if this fails)
      if (userData.name) {
        try {
          await updateProfile(user, { displayName: userData.name });
        } catch (e) {
          console.warn("updateProfile failed (non-fatal):", e);
        }
      }

      // Best-effort profile writes; warn if they fail but do not break auth creation
      try {
        const userDoc: any = {
          uid: user.uid,
          email: user.email!,
          name: userData.name || "",
          role: userData.role || "member",
          createdAt: new Date().toISOString(),
          status: "active",
        };

        // Add cadet fields if present
        if (userData.role === "member") {
          userDoc.dateOfBirth = userData.dateOfBirth || "";
          userDoc.registerNumber = userData.registerNumber || "";
          userDoc.division = userData.division || "";
          userDoc.regimentalNumber = userData.regimentalNumber || "";
          userDoc.dateOfEnrollment = userData.dateOfEnrollment || "";
          userDoc.rank = userData.rank || "CDT";
          userDoc.nccYear = "1st Year";
          userDoc.year = userData.year || "1st Year";
          userDoc.department = userData.department || "";
          userDoc.rollNo = userData.rollNo || "";
          userDoc.phone = userData.phone || "";
          userDoc.bloodGroup = userData.bloodGroup || "";
          userDoc.address = userData.address || "";
        }

        await setDoc(doc(db, "users", user.uid), userDoc);
      } catch (e: any) {
        console.error("Profile write failed after account creation:", e);
        const msg = mapFirebaseAuthError(e?.code);
        toast(`Account created, but profile save failed. ${msg}`, {
          icon: "⚠️",
        });
      }

      toast.success("Account created successfully!");
      return user;
    } catch (error: any) {
      console.error("Sign up error:", error);
      const message = mapFirebaseAuthError(error?.code);
      toast.error(message);
      throw error;
    }
  };

  // Sign in
  const signIn = async (
    email: string,
    password: string,
  ): Promise<UserCredential> => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;

      // Force name sync on login immediately to fix missing name in reset emails
      if (!user.displayName) {
        let finalName = "";
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            finalName = userDoc.data().name;
          } else {
            const q = query(
              collection(db, "pendingCadets"),
              where("uid", "==", user.uid),
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              finalName = snap.docs[0].data().name;
            }
          }
          if (finalName) {
            await updateProfile(user, { displayName: finalName });
            await user.reload();
          }
        } catch (e) {
          console.warn("Silent sync failed:", e);
        }
      }

      toast.success("Logged in successfully!");
      return result;
    } catch (error: any) {
      console.error("Sign in error:", error);
      const message = mapFirebaseAuthError(error?.code);
      toast.error(message);
      throw error;
    }
  };

  // Sign in with Google (only for existing approved users)
  const signInWithGoogle = async (): Promise<FirebaseUser> => {
    const provider = new GoogleAuthProvider();
    // Always show the account picker so users can choose which Google account to use
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in the 'users' or 'alumni' collection (approved users only)
      const userDocSnap = await getDoc(doc(db, "users", user.uid));
      const alumniDocSnap = await getDoc(doc(db, "alumni", user.uid));

      if (!userDocSnap.exists() && !alumniDocSnap.exists()) {
        // Also check by email in case UID differs (e.g., originally registered with email/password)
        const usersQuery = query(
          collection(db, "users"),
          where("email", "==", user.email),
        );
        const usersSnapshot = await getDocs(usersQuery);

        const alumniQuery = query(
          collection(db, "alumni"),
          where("email", "==", user.email),
        );
        const alumniSnapshot = await getDocs(alumniQuery);

        if (usersSnapshot.empty && alumniSnapshot.empty) {
          // Check if they are in pendingCadets
          const pendingQuery = query(
            collection(db, "pendingCadets"),
            where("email", "==", user.email),
          );
          const pendingSnapshot = await getDocs(pendingQuery);

          if (!pendingSnapshot.empty) {
            await firebaseSignOut(auth);
            setUserProfile(null);
            toast.error("Your account is still pending approval by an admin.");
            throw new Error("NOT_APPROVED");
          }

          // Not a registered user — delete the auto-created Google Auth account
          try {
            await deleteUser(user);
          } catch (deleteErr) {
            console.warn(
              "Could not delete unregistered Google auth account:",
              deleteErr,
            );
          }
          await firebaseSignOut(auth);
          setUserProfile(null);

          toast.error("No approved account found. Please register first.");
          throw new Error("NOT_REGISTERED");
        } else {
          // AUTO-HEAL: User exists by email, but under a different UID.
          // This happens if their Auth account was recreated (e.g. they deleted it, or our old pending check deleted it).
          // We must migrate their Firestore documents to the new UID.
          try {
            const batch = writeBatch(db);
            let migrated = false;

            if (!usersSnapshot.empty) {
              const oldDoc = usersSnapshot.docs[0];
              const oldUid = oldDoc.id;
              if (oldUid !== user.uid) {
                batch.set(doc(db, "users", user.uid), {
                  ...oldDoc.data(),
                  uid: user.uid,
                });
                batch.delete(doc(db, "users", oldUid));

                // Migrate cadets doc if exists
                const oldCadetDoc = await getDoc(doc(db, "cadets", oldUid));
                if (oldCadetDoc.exists()) {
                  batch.set(doc(db, "cadets", user.uid), {
                    ...oldCadetDoc.data(),
                    uid: user.uid,
                  });
                  batch.delete(doc(db, "cadets", oldUid));
                }

                // Migrate takenNumbers
                const takenQuery = query(
                  collection(db, "takenNumbers"),
                  where("uid", "==", oldUid),
                );
                const takenSnap = await getDocs(takenQuery);
                takenSnap.forEach((tDoc) => {
                  batch.update(tDoc.ref, { uid: user.uid });
                });

                migrated = true;
              }
            } else if (!alumniSnapshot.empty) {
              const oldDoc = alumniSnapshot.docs[0];
              const oldUid = oldDoc.id;
              if (oldUid !== user.uid) {
                batch.set(doc(db, "alumni", user.uid), {
                  ...oldDoc.data(),
                  uid: user.uid,
                });
                batch.delete(doc(db, "alumni", oldUid));
                migrated = true;
              }
            }

            if (migrated) {
              await batch.commit();
              console.log("Successfully migrated user data to new Google UID");
            }
          } catch (migrationErr) {
            console.error("Failed to migrate user data:", migrationErr);
            // We don't block login, but it might fail later in ProtectedRoute if migration fails
          }
        }
      }

      toast.success("Logged in with Google successfully!");
      return user;
    } catch (error: any) {
      if (error?.message === "NOT_REGISTERED") {
        throw error;
      }
      console.error("Google sign in error:", error);
      // If popup was closed by user, don't show an error toast
      if (
        error?.code !== "auth/popup-closed-by-user" &&
        error?.code !== "auth/cancelled-popup-request"
      ) {
        const message = mapFirebaseAuthError(error?.code);
        toast.error(message);
      }
      throw error;
    }
  };

  // Sign out
  const signOut = async (): Promise<void> => {
    try {
      await firebaseSignOut(auth);
      cacheProfile(null);
      setUserProfile(null);
      setNetworkError(false);
      toast.success("Logged out successfully!");
    } catch (error: any) {
      console.error("Sign out error:", error);
      const message = mapFirebaseAuthError(error?.code);
      toast.error(message);
      throw error;
    }
  };

  // Reset password
  const resetPassword = async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("Password reset email sent!");
    } catch (error: any) {
      console.error("Reset password error:", error);
      const message = mapFirebaseAuthError(error?.code);
      toast.error(message);
      throw error;
    }
  };

  // Check if user has role
  const hasRole = (role: UserRole | UserRole[]): boolean => {
    if (!userProfile) return false;
    if (Array.isArray(role)) {
      return role.includes(userProfile.role);
    }
    return userProfile.role === role;
  };

  // Check if user is admin or superadmin
  const isAdmin = (): boolean => hasRole(["admin", "superadmin"]);
  const isSuperAdmin = (): boolean => hasRole("superadmin");
  const isAlumni = (): boolean => hasRole("alumni" as UserRole);

  const isMember = (): boolean => hasRole("member");
  // Removed legacy 'cadet' role; retain helper returning false for compatibility
  const isCadet = (): boolean => false;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: any) => {
      setCurrentUser(user);
      if (user) {
        // Immediate restore from cache if available for this user
        const cached = getCachedProfile();
        if (cached && cached.uid === user.uid) {
          setUserProfile(cached);
          setProfileLoading(false);
        } else {
          setProfileLoading(true);
        }

        try {
          const profile = await fetchUserProfile(user.uid);
          let finalName = profile?.name;

          // If not in users collection, they might be an existing pending cadet
          if (!finalName && !user.displayName) {
            try {
              const pendingQuery = query(
                collection(db, "pendingCadets"),
                where("uid", "==", user.uid),
              );
              const pendingSnap = await getDocs(pendingQuery);
              if (!pendingSnap.empty) {
                const pendingDoc = pendingSnap.docs[0];
                finalName = pendingDoc.data().name;

                // Auto-sync email verification status from Firebase Auth → Firestore
                // This fixes the case where user verified email after session expired
                if (user.emailVerified && !pendingDoc.data().emailVerified) {
                  try {
                    await setDoc(
                      pendingDoc.ref,
                      { emailVerified: true },
                      { merge: true },
                    );
                    console.log(
                      "Auto-synced email verification for pending cadet:",
                      user.email,
                    );
                  } catch (syncErr) {
                    console.warn(
                      "Failed to sync email verification status:",
                      syncErr,
                    );
                  }
                }
              }
            } catch (err) {
              console.warn("Failed to fetch pending cadet name", err);
            }
          }

          // Sync displayName to Firebase Auth if it's missing (fixes %DISPLAY_NAME% in reset emails)
          if (finalName && !user.displayName) {
            try {
              await updateProfile(user, { displayName: finalName });
            } catch (e) {
              console.warn("Failed to sync displayName:", e);
            }
          }
        } catch (fetchErr) {
          console.error("Profile fetch error on auth state change:", fetchErr);
          // Only show network error screen if we don't have a cached profile to keep working with
          const currentCached = getCachedProfile();
          if (!currentCached || currentCached.uid !== user.uid) {
            setNetworkError(true);
          }
        } finally {
          setProfileLoading(false);
        }
      } else {
        cacheProfile(null);
        setUserProfile(null);
        setProfileLoading(false);
        setNetworkError(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    userProfile,
    loading,
    profileLoading,
    networkError,
    retryProfileFetch,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    hasRole,
    isAdmin,
    isSuperAdmin,
    isAlumni,
    isMember,
    isCadet,
    fetchUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
