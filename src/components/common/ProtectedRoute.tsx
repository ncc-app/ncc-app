import React, { ReactNode } from "react";
import { Spinner } from "react-bootstrap";
import { Navigate } from "react-router-dom";
import { UserRole } from "../../shared/config/constants";
import { useAuth } from "@/features/auth/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRoles = [],
}) => {
  const {
    currentUser,
    userProfile,
    loading,
    profileLoading,
    networkError,
    retryProfileFetch,
  } = useAuth();

  // 1. Auth state is still initializing from Firebase
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <Spinner as="span" animation="border" variant="primary" size="sm" />
      </div>
    );
  }

  // 2. User is not logged in -> redirect to login
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // 3. User is logged in, but profile is currently loading (initial fetch with no cache)
  if (profileLoading && !userProfile) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center min-vh-100">
        <Spinner as="span" animation="border" variant="primary" className="mb-3" />
        <p className="text-muted small">Loading your profile...</p>
      </div>
    );
  }

  // 4. Network error occurred on slow/offline network and no cached profile is available
  if (networkError && !userProfile) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center min-vh-100 text-center px-3">
        <div className="text-warning mb-3" style={{ fontSize: "2.5rem" }}>
          <i className="bi bi-wifi-off"></i>
        </div>
        <h4 className="fw-bold">Slow or Unstable Connection</h4>
        <p className="text-muted" style={{ maxWidth: "420px" }}>
          We could not load your user profile due to a network delay or disconnection.
        </p>
        <button
          className="btn btn-primary mt-2"
          onClick={() => retryProfileFetch()}
        >
          <i className="bi bi-arrow-clockwise me-2"></i> Retry Connection
        </button>
      </div>
    );
  }

  // 5. If the user has not been approved yet, they won't have an active userProfile
  if (!userProfile || userProfile.status !== "active") {
    return <Navigate to="/unauthorized" replace />;
  }

  // 6. Check role requirements
  if (requiredRoles.length > 0 && !requiredRoles.includes(userProfile.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
