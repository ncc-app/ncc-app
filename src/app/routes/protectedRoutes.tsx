import React from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components";
import DashboardHome from "@/pages/dashboard/DashboardHome";
import Profile from "@/pages/dashboard/Profile";
import AnnouncementsAdmin from "@/pages/dashboard/announcements/AnnouncementsAdmin";
import AttendanceManagement from "@/pages/dashboard/attendance/AttendanceManagement";
import AttendanceView from "@/pages/dashboard/attendance/AttendanceView";
import CadetManagement from "@/pages/dashboard/users/CadetManagement";
import AnnualAttendanceReport from "@/pages/dashboard/reports/AnnualAttendanceReport";
import NominalRollReport from "@/pages/dashboard/reports/NominalRollReport";
import CatcCampReport from "@/pages/dashboard/reports/CatcCampReport";
import ParadeStateReport from "@/pages/dashboard/reports/ParadeStateReport";
import TrainingDiaryReport from "@/pages/dashboard/reports/TrainingDiaryReport";
import OnDutyLetterReport from "@/pages/dashboard/reports/OnDutyLetterReport";
import ReportsTemplateManager from "@/pages/dashboard/reports/ReportsTemplateManager";
import ReportsWorkspace from "@/pages/dashboard/reports/ReportsWorkspace";
import RoleManagement from "@/pages/dashboard/users/RoleManagement";
import UserManagement from "@/pages/dashboard/users/UserManagement";
import AdminSettings from "@/pages/dashboard/settings/AdminSettings";
import AlumniManagement from "@/pages/dashboard/alumni/AlumniManagement";
import EventDriveManagement from "@/pages/dashboard/eventDrives/EventDriveManagement";
import DriveDetailPage from "@/pages/dashboard/eventDrives/DriveDetailPage";
import EventDrivesView from "@/pages/dashboard/eventDrives/EventDrivesView";

export const protectedRoutes = (
  <>
    <Route
      path="/dashboard"
      element={
        <ProtectedRoute>
          <DashboardHome />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/dashboard"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <DashboardHome />
        </ProtectedRoute>
      }
    />
    <Route
      path="/profile"
      element={
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      }
    />
    <Route
      path="/attendance"
      element={
        <ProtectedRoute requiredRoles={["member"]}>
          <AttendanceView />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/roles"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <RoleManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/users"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <UserManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/attendance"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <AttendanceManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/cadets"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <CadetManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/duties"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <div className="container py-5">
            <h2>Duty Management</h2>
          </div>
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/event-drives"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <EventDriveManagement />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/event-drives/:driveId"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin", "alumni"]}>
          <DriveDetailPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/event-drives"
      element={
        <ProtectedRoute>
          <EventDrivesView />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <ReportsWorkspace />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports/generators/on-duty-letter"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <OnDutyLetterReport />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports/generators/annual-attendance"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <AnnualAttendanceReport />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports/templates"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <ReportsTemplateManager />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports/generators/nominal-roll"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <NominalRollReport />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports/generators/catc-camp"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <CatcCampReport />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports/generators/parade-state"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <ParadeStateReport />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/reports/generators/training-diary"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <TrainingDiaryReport />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/announcements"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <AnnouncementsAdmin />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/settings"
      element={
        <ProtectedRoute requiredRoles={["admin", "superadmin"]}>
          <AdminSettings />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/alumni"
      element={
        <ProtectedRoute requiredRoles={["superadmin"]}>
          <AlumniManagement />
        </ProtectedRoute>
      }
    />
  </>
);

const ProtectedRoutes: React.FC = () => {
  return protectedRoutes;
};

export default ProtectedRoutes;
