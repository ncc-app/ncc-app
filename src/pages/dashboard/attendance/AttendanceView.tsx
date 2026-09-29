import { useState, useEffect, useMemo } from "react";
import { Card, Spinner, Tab, Tabs } from "react-bootstrap";
import { useAuth } from "@/features/auth/AuthContext";
import {
  StatsOverview,
  PerformanceGraphs,
  SessionHistory,
} from "./user";
import {
  getCadetByUserId,
  getUserAttendanceHistory,
} from "@/features/attendance/service";
import type {
  AttendanceSession,
  AttendanceMark,
  CadetAttendanceStats,
} from "@/features/attendance/attendance.types";
import type { AttendanceCategory } from "@/features/attendance/attendance.types";
import type { Cadet } from "@/shared/types";
import { normalizeNccYear } from "@/shared/config/constants";
import { isAnoUser } from "@/shared/utils/userType";
import type { Division } from "@/shared/config/constants";

const AttendanceView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [cadet, setCadet] = useState<(Cadet & { id: string }) | null>(null);
  const [history, setHistory] = useState<
    Array<{
      session: AttendanceSession & { id: string };
      mark: AttendanceMark | null;
    }>
  >([]);
  // Load cadet data
  useEffect(() => {
    const activeUser = currentUser;
    if (!activeUser) return;
    const uid = activeUser.uid;

    async function loadData() {
      setLoading(true);
      try {
        // Get cadet profile
        const cadetData = await getCadetByUserId(uid);
        setCadet(cadetData);

        if (cadetData) {
          const cadetNccYear = normalizeNccYear(cadetData.nccYear);
          // Get history
          const historyData = await getUserAttendanceHistory(
            cadetData.id,
            cadetData.division as Division,
            cadetNccYear || undefined,
          );
          setHistory(historyData);
        }
      } catch (e) {
        console.error("Error loading attendance data:", e);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [currentUser]);

  // Compute overview stats from all marked sessions provided by admin-side marking.
  const computedStats = useMemo<CadetAttendanceStats | null>(() => {
    if (!cadet || !history.length) return null;
    const cadetNccYear = normalizeNccYear(cadet.nccYear);
    if (!cadetNccYear) return null;

    let present = 0,
      absent = 0;
    const monthly: Record<
      string,
      { total: number; present: number; absent: number }
    > = {};
    const categories: AttendanceCategory[] = [
      "Theory Class",
      "Parade",
      "Volunteering",
      "Other",
    ];
    const categoryBreakdown = Object.fromEntries(
      categories.map((category) => [
        category,
        { total: 0, present: 0, absent: 0 },
      ]),
    ) as CadetAttendanceStats["categoryBreakdown"];

    history.forEach(({ session, mark }) => {
      if (!mark) return;
      switch (mark.status) {
        case "P":
          present++;
          break;
        case "A":
          absent++;
          break;
      }

      const monthKey = session.date.substring(0, 7); // YYYY-MM
      if (!monthly[monthKey]) {
        monthly[monthKey] = { total: 0, present: 0, absent: 0 };
      }
      monthly[monthKey].total++;
      if (mark.status === "P") monthly[monthKey].present++;
      if (mark.status === "A") monthly[monthKey].absent++;

      const category = session.category || "Other";
      const categoryStats = categoryBreakdown?.[category];
      if (categoryStats) {
        categoryStats.total++;
        if (mark.status === "P") categoryStats.present++;
        if (mark.status === "A") categoryStats.absent++;
      }
    });

    const totalSessions = present + absent;
    const attendanceRate =
      totalSessions > 0 ? Math.round((present / totalSessions) * 1000) / 10 : 0;

    return {
      cadetId: cadet.id,
      divisionId: cadet.division as any,
      nccYear: cadetNccYear,
      totalSessions,
      present,
      absent,
      attendanceRate,
      monthly,
      categoryBreakdown,
      recentSessionIds: history.slice(0, 10).map((h) => h.session.id!),
      updatedAt: new Date().toISOString(),
    };
  }, [cadet, history]);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner as="span" animation="border" size="sm" />
      </div>
    );
  }

  if (!cadet) {
    if (isAnoUser(userProfile)) {
      return (
        <div className="container py-4">
          <Card>
            <Card.Body className="text-center py-5 text-muted">
              <i className="bi bi-shield-check fs-1 d-block mb-3"></i>
              <p className="mb-2">
                Attendance is not applicable to ANO accounts.
              </p>
              <p className="mb-0">
                You can still manage and mark attendance for all cadets from
                Admin Attendance.
              </p>
            </Card.Body>
          </Card>
        </div>
      );
    }

    return (
      <div className="container py-4">
        <Card>
          <Card.Body className="text-center py-5 text-muted">
            <i className="bi bi-person-x fs-1 d-block mb-3"></i>
            <p>Your profile is not set up as a cadet yet.</p>
            <p>
              Please contact an administrator to complete your registration.
            </p>
          </Card.Body>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">My Attendance</h2>
          <p className="text-muted mb-0">
            {cadet.name} | {cadet.division} |{" "}
            {normalizeNccYear(cadet.nccYear) || "-"}
          </p>
        </div>
      </div>

      <Tabs
        id="attendance-view-tabs"
        activeKey={activeTab}
        onSelect={(k: string | null) => setActiveTab(k || "overview")}
        className="mb-4"
      >
        {/* Overview Tab */}
        <Tab eventKey="overview" title="Overview">
          <div className="mb-4">
            <StatsOverview stats={computedStats} />
          </div>
          <PerformanceGraphs stats={computedStats} />
        </Tab>

        {/* History Tab */}
        <Tab eventKey="history" title="History">
          <SessionHistory history={history} />
        </Tab>
      </Tabs>
    </div>
  );
};

export default AttendanceView;
