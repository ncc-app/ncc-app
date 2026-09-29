import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Row,
  Col,
  Card,
  Table,
  Spinner,
  Alert,
  Button,
  Badge,
  Form,
} from "react-bootstrap";
import { BatchSelector } from "./BatchSelector";
import {
  DIVISIONS,
  ATTENDANCE_THRESHOLDS,
  normalizeNccYear,
} from "@/shared/config/constants";
import type { Division, NccYear } from "@/shared/config/constants";
import type { AttendanceSession } from "@/features/attendance/attendance.types";
import type { Cadet } from "@/shared/types";
import toast from "react-hot-toast";
import { getCadetStats } from "@/features/attendance/service";

interface CadetAttendanceRate {
  cadet: Cadet & { id: string };
  rate: number;
  present: number;
  total: number;
}

interface AdminDashboardProps {
  sessions: (AttendanceSession & { id: string })[];
  cadets: (Cadet & { id: string })[];
  loading?: boolean;
}

export function AdminDashboard({
  sessions,
  cadets,
  loading = false,
}: AdminDashboardProps) {
  const navigate = useNavigate();
  const [divisionFilter, setDivisionFilter] = useState<Division | "">("");
  const [yearFilter, setYearFilter] = useState<NccYear | "">("");
  const [reportDivision, setReportDivision] = useState<Division | "">("");
  const [reportYear, setReportYear] = useState<NccYear | "">("");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");

  const filteredSessions = useMemo(
    () =>
      sessions.filter((s) => {
        const matchesDivision =
          !divisionFilter || s.divisionId === divisionFilter;
        const matchesYear = !yearFilter || s.nccYear === yearFilter;
        return matchesDivision && matchesYear;
      }),
    [sessions, divisionFilter, yearFilter],
  );

  const filteredLockedSessions = useMemo(
    () => filteredSessions.filter((s) => s.status === "locked"),
    [filteredSessions],
  );

  const filteredCadets = useMemo(
    () =>
      cadets.filter((c) => {
        const normalizedCadetYear = normalizeNccYear(c.nccYear);
        const hasValidNccYear = normalizedCadetYear !== "";
        const matchesDivision =
          !divisionFilter || c.division === divisionFilter;
        const matchesYear = !yearFilter || normalizedCadetYear === yearFilter;
        return hasValidNccYear && matchesDivision && matchesYear;
      }),
    [cadets, divisionFilter, yearFilter],
  );

  // Summary stats
  const summaryStats = useMemo(() => {
    let totalPresent = 0,
      totalMarks = 0;
    filteredLockedSessions.forEach((s) => {
      if (s.stats) {
        totalPresent += s.stats.present;
        totalMarks += s.stats.total;
      }
    });

    const avgRate = totalMarks > 0 ? (totalPresent / totalMarks) * 100 : 0;

    return {
      totalSessions: filteredLockedSessions.length,
      avgAttendanceRate: Math.round(avgRate * 10) / 10,
      totalCadets: filteredCadets.length,
    };
  }, [filteredLockedSessions, filteredCadets]);

  const [lowAttendanceCadets, setLowAttendanceCadets] = useState<
    CadetAttendanceRate[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    async function loadLowAttendanceCadets() {
      const stats = await Promise.all(
        filteredCadets.map(async (cadet) => ({
          cadet,
          stats: await getCadetStats(cadet.id),
        })),
      );

      if (cancelled) return;
      setLowAttendanceCadets(
        stats
          .filter(
            ({ stats }) =>
              stats && stats.totalSessions > 0 && stats.attendanceRate < ATTENDANCE_THRESHOLDS.LOW,
          )
          .map(({ cadet, stats }) => ({
            cadet,
            rate: stats!.attendanceRate,
            present: stats!.present,
            total: stats!.totalSessions,
          }))
          .sort((a, b) => a.rate - b.rate),
      );
    }

    loadLowAttendanceCadets().catch((error) => {
      console.error("Error loading low attendance data:", error);
      if (!cancelled) setLowAttendanceCadets([]);
    });

    return () => {
      cancelled = true;
    };
  }, [filteredCadets]);

  const handleReportExport = () => {
    toast("Export coming soon", { icon: "ℹ️" });
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner as="span" animation="border" size="sm" />
        <p className="mt-2">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard py-5 container">
      <Card className="shadow border-0">
        <Card.Header className="bg-primary text-white d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
          <div className="d-flex align-items-center">
            <i className="bi bi-clipboard-data fs-4 me-2" />
            <h3 className="mb-0">Attendance Dashboard</h3>
          </div>
          <Button
            variant="light"
            size="sm"
            onClick={() => navigate("/dashboard")}
          >
            <i className="bi bi-arrow-left me-1"></i> Back
          </Button>
        </Card.Header>
        <Card.Body className="bg-light">
          {/* Filters */}
          <Card className="mb-4">
            <Card.Body>
              <BatchSelector
                divisionId={divisionFilter}
                nccYear={yearFilter}
                onDivisionChange={setDivisionFilter}
                onYearChange={setYearFilter}
              />
            </Card.Body>
          </Card>

          {/* Summary Cards */}

          <Row className="g-3 mb-4">
            <Col md={4}>
              <Card className="h-100 text-center">
                <Card.Body>
                  <h3 className="text-primary mb-1">
                    {summaryStats.totalSessions}
                  </h3>
                  <small className="text-muted">Total Sessions</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="h-100 text-center">
                <Card.Body>
                  <h3
                    className={`mb-1 ${
                      summaryStats.avgAttendanceRate >=
                      ATTENDANCE_THRESHOLDS.GOOD
                        ? "text-success"
                        : summaryStats.avgAttendanceRate >=
                            ATTENDANCE_THRESHOLDS.LOW
                          ? "text-warning"
                          : "text-danger"
                    }`}
                  >
                    {summaryStats.avgAttendanceRate}%
                  </h3>
                  <small className="text-muted">Avg Attendance</small>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="h-100 text-center">
                <Card.Body>
                  <h3 className="text-secondary mb-1">
                    {summaryStats.totalCadets}
                  </h3>
                  <small className="text-muted">Total Cadets</small>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Row className="g-3 mb-4">
            <Col lg={7}>
              <Card className="h-100">
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">
                    <i className="bi bi-exclamation-triangle text-warning me-2"></i>
                    Low Attendance Alerts
                  </h6>
                </Card.Header>
                <Card.Body style={{ maxHeight: 300, overflowY: "auto" }}>
                  {lowAttendanceCadets.length === 0 ? (
                    <Alert variant="light" className="mb-0">
                      All cadets in this selection have good attendance (above 75%), or no sessions have been marked yet!
                    </Alert>
                  ) : (
                    <Table size="sm" hover>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Division</th>
                          <th>Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowAttendanceCadets.map((item) => (
                          <tr key={item.cadet.id}>
                            <td>{item.cadet.name}</td>
                            <td>{item.cadet.division || "-"}</td>
                            <td>
                              <Badge bg="danger">{item.rate}%</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card.Body>
              </Card>
            </Col>
            <Col lg={5}>
              <Card className="h-100">
                <Card.Header>
                  <h6 className="mb-0">Generate Attendance Report</h6>
                </Card.Header>
                <Card.Body>
                  <Row className="g-3">
                    <Col sm={6}>
                      <Form.Label>Division</Form.Label>
                      <Form.Select
                        value={reportDivision}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          setReportDivision(e.target.value as Division | "")
                        }
                      >
                        <option value="">All divisions</option>
                        {DIVISIONS.map((division) => (
                          <option key={division} value={division}>
                            {division}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col sm={6}>
                      <Form.Label>NCC Year</Form.Label>
                      <Form.Select
                        value={reportYear}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          setReportYear(e.target.value as NccYear | "")
                        }
                      >
                        <option value="">All years</option>
                        {(["1st Year", "2nd Year", "3rd Year"] as NccYear[]).map(
                          (year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ),
                        )}
                      </Form.Select>
                    </Col>
                    <Col sm={6}>
                      <Form.Label>From</Form.Label>
                      <Form.Control
                        type="date"
                        value={reportStartDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReportStartDate(e.target.value)}
                      />
                    </Col>
                    <Col sm={6}>
                      <Form.Label>To</Form.Label>
                      <Form.Control
                        type="date"
                        value={reportEndDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReportEndDate(e.target.value)}
                      />
                    </Col>
                  </Row>
                  <Button className="mt-3" onClick={handleReportExport}>
                    <i className="bi bi-download me-1" /> Export
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Recent Sessions */}
          <Card>
            <Card.Header>
              <h6 className="mb-0">Recent Locked Sessions</h6>
            </Card.Header>
            <Card.Body>
              {filteredLockedSessions.length === 0 ? (
                <Alert variant="light" className="mb-0 text-center">
                  No locked sessions found for the selected filters.
                </Alert>
              ) : (
                <Table responsive hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Title</th>
                      <th>Division</th>
                      <th>Year</th>
                      <th>Present</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLockedSessions.slice(0, 10).map((session) => (
                      <tr key={session.id}>
                        <td>{session.date}</td>
                        <td>{session.title}</td>
                        <td>{session.divisionId}</td>
                        <td>{session.nccYear}</td>
                        <td>
                          {session.stats &&
                            `${session.stats.present}/${session.stats.total}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Card.Body>
      </Card>
    </div>
  );
}
