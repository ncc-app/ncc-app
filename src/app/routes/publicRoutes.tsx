import React from "react";
import { Link, Route } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import {
  About,
  Achievements,
  Alumni,
  CadetList,
  Camps,
  Contact,
  Home,
  NationalDays,
  Notifications,
  Parades,
  Photos,
  Ranks,
  Recruitment,
  Resources,
  SocialService,
  Videos,
} from "@/pages/public";
import NotFound from "@/pages/NotFound";
import AlumniSubmitForm from "@/pages/public/AlumniSubmitForm";
import { ForgotPassword, Login, Register, VerifyEmail } from "@/pages/auth";

const Unauthorized: React.FC = () => {
  const { currentUser, userProfile, signOut } = useAuth();

  const getDashboardPath = () => {
    if (!userProfile) return "/login";
    if (userProfile.role === "admin" || userProfile.role === "superadmin") {
      return "/admin/dashboard";
    }
    return "/dashboard";
  };

  return (
    <div className="container py-5 text-center min-vh-75 d-flex flex-column justify-content-center align-items-center">
      <div className="text-warning mb-3" style={{ fontSize: "3rem" }}>
        <i className="bi bi-shield-lock"></i>
      </div>
      <h2 className="fw-bold mb-3">Access Denied</h2>
      <p className="text-muted mx-auto mb-4" style={{ maxWidth: "480px" }}>
        {currentUser && userProfile?.status === "active"
          ? "You don't have permission to view the requested page with your current account role."
          : "You don't have permission to view this page, or your account is still pending approval by an admin."}
      </p>

      <div className="d-flex flex-wrap justify-content-center gap-3">
        {currentUser && userProfile?.status === "active" && (
          <Link to={getDashboardPath()} className="btn btn-primary px-4">
            <i className="bi bi-speedometer2 me-2"></i>
            Go to Dashboard
          </Link>
        )}
        <Link to="/" className="btn btn-outline-secondary px-4">
          <i className="bi bi-house me-2"></i>
          Home
        </Link>
        {currentUser && (
          <button
            onClick={() => signOut()}
            className="btn btn-outline-danger px-4"
          >
            <i className="bi bi-box-arrow-right me-2"></i>
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
};

export const publicRoutes = (
  <>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/about" element={<About />} />
    <Route path="/activities/camps" element={<Camps />} />
    <Route path="/activities/social-service" element={<SocialService />} />
    <Route path="/activities/parades" element={<Parades />} />
    <Route path="/events/national-days" element={<NationalDays />} />
    <Route path="/gallery/photos" element={<Photos />} />
    <Route path="/gallery/videos" element={<Videos />} />
    <Route path="/cadets/list" element={<CadetList />} />
    <Route path="/cadets/ranks" element={<Ranks />} />
    <Route path="/cadets/achievements" element={<Achievements />} />
    <Route path="/resources" element={<Resources />} />
    <Route path="/alumni" element={<Alumni />} />
    <Route path="/alumni/submit" element={<AlumniSubmitForm />} />
    <Route path="/contact" element={<Contact />} />
    <Route path="/notifications" element={<Notifications />} />
    <Route path="/recruitment" element={<Recruitment />} />
    <Route path="/unauthorized" element={<Unauthorized />} />
    <Route path="*" element={<NotFound />} />
  </>
);

const PublicRoutes: React.FC = () => {
  return publicRoutes;
};

export default PublicRoutes;
