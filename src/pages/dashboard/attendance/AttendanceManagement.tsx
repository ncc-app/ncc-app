import { useState, useEffect, useMemo, type ChangeEvent } from "react";
import {
  Button,
  Col,
  Form,
  Row,
  Spinner,
  Tab,
  Table,
  Tabs,
  Badge,
  Card,
  Modal,
} from "react-bootstrap";
import toast from "react-hot-toast";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { useAuth } from "@/features/auth/AuthContext";

import { AdminDashboard, BatchSelector, BulkMarker } from "./admin";
import AttendanceView from "./AttendanceView";
import {
  cleanupLegacySessionFields,
  createSession,
  deleteSession,
  listCadets,
  listMarks,
  listenSessions,
} from "@/features/attendance/service";
import type {
  AttendanceSession,
  SessionFormData,
} from "@/features/attendance/attendance.types";
import type { Cadet } from "@/shared/types";
import type { Division, NccYear } from "@/shared/config/constants";
import {
  NCC_YEARS,
  DIVISIONS,
  DIVISION_LABELS,
  ATTENDANCE_SESSION_TITLE_OPTIONS,
  type AttendanceSessionTitle,
  normalizeNccYear,
} from "@/shared/config/constants";
import {
  formatISTDate,
  formatISTDateTime,
  toISTDateInputValue,
} from "@/shared/utils/dateTime";

const AttendanceManagement: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cadets, setCadets] = useState<(Cadet & { id: string })[]>([]);
  const [sessions, setSessions] = useState<
    (AttendanceSession & { id: string })[]
  >([]);
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Generator form state
  const [gDivision, setGDivision] = useState<Division | "">("SD");
  const [gYear, setGYear] = useState<NccYear | "">("1st Year");
  const [gTitleType, setGTitleType] =
    useState<AttendanceSessionTitle>("Parade");
  const [gTitle, setGTitle] = useState("Parade");
  const [gDate, setGDate] = useState(() => toISTDateInputValue());
  const [gDoubleParade, setGDoubleParade] = useState(false);
  const [gOfficialParade, setGOfficialParade] = useState(false);
  const [creating, setCreating] = useState(false);

  // Marker state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [sessionDivisionFilter, setSessionDivisionFilter] =
    useState<Division>("SD");
  const [sessionYearFilter, setSessionYearFilter] = useState<NccYear | "">("");
  const [sessionStatusFilter, setSessionStatusFilter] = useState<
    "open" | "locked"
  >("open");
  const [sessionOfficialFilter, setSessionOfficialFilter] = useState(false);
  const [sessionDoubleFilter, setSessionDoubleFilter] = useState(false);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<
    string | null
  >(null);

  // Reporter state
  const [reportDivision, setReportDivision] = useState<Division | "">("SD");
  const [reportYear, setReportYear] = useState<NccYear | "">("1st Year");
  const [reportSessionId, setReportSessionId] = useState<string>("");
  const [reportMarks, setReportMarks] = useState<
    Record<string, { status: string; timestamp: string }>
  >({});
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const role = userProfile?.role;
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "superadmin";
  const canViewOwnAttendanceTab = isAdmin;
  const canManageAttendance = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (!canManageAttendance) return;

    const allowed = canViewOwnAttendanceTab
      ? new Set([
          "dashboard",
          "my-attendance",
          "sessions",
          "marker",
          "reporter",
        ])
      : new Set(["dashboard", "sessions", "marker", "reporter"]);

    if (!allowed.has(activeTab)) {
      setActiveTab("dashboard");
    }
  }, [activeTab, canManageAttendance, canViewOwnAttendanceTab]);

  // Load initial data
  useEffect(() => {
    let unsubSessions: (() => void) | null = null;

    async function init() {
      try {
        await cleanupLegacySessionFields();
        const cadetsList = await listCadets();
        setCadets(cadetsList);
        unsubSessions = listenSessions((items) => setSessions(items));
      } catch (e: any) {
        console.error(e);
        toast.error(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    init();
    return () => {
      if (unsubSessions) unsubSessions();
    };
  }, []);

  // Load marks for selected report session
  useEffect(() => {
    if (!reportSessionId) {
      setReportMarks({});
      return;
    }

    async function loadMarks() {
      const marks = await listMarks(reportSessionId);
      const marksMap: Record<string, { status: string; timestamp: string }> =
        {};
      marks.forEach((m) => {
        marksMap[m.cadetId] = { status: m.status, timestamp: m.markedAt };
      });
      setReportMarks(marksMap);
    }

    loadMarks();
  }, [reportSessionId]);

  // Eligible cadets for session creation
  const eligibleCadets = useMemo(() => {
    if (!gDivision || !gYear) return [];
    return cadets.filter(
      (c) => c.division === gDivision && normalizeNccYear(c.nccYear) === gYear,
    );
  }, [cadets, gDivision, gYear]);

  const filteredRecentSessions = useMemo(() => {
    const yearIndex = new Map(NCC_YEARS.map((y, idx) => [y, idx]));

    return sessions
      .filter((s) => {
        const matchesDivision = s.divisionId === sessionDivisionFilter;
        const matchesYear =
          !sessionYearFilter || s.nccYear === sessionYearFilter;
        const matchesStatus = s.status === sessionStatusFilter;
        const matchesOfficial =
          !sessionOfficialFilter || s.isOfficialParade === true;
        const matchesDouble = !sessionDoubleFilter || (s.paradeCount || 1) >= 2;
        return (
          matchesDivision &&
          matchesYear &&
          matchesStatus &&
          matchesOfficial &&
          matchesDouble
        );
      })
      .sort((a, b) => {
        const byDateDesc = b.date.localeCompare(a.date);
        if (byDateDesc !== 0) return byDateDesc;

        const byYearAsc =
          (yearIndex.get(a.nccYear as NccYear) ?? Number.MAX_SAFE_INTEGER) -
          (yearIndex.get(b.nccYear as NccYear) ?? Number.MAX_SAFE_INTEGER);
        if (byYearAsc !== 0) return byYearAsc;

        return a.title.localeCompare(b.title);
      });
  }, [
    sessions,
    sessionDivisionFilter,
    sessionYearFilter,
    sessionStatusFilter,
    sessionOfficialFilter,
    sessionDoubleFilter,
  ]);

  // Filtered sessions for reporter
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesDivision =
        !reportDivision || s.divisionId === reportDivision;
      const matchesYear = !reportYear || s.nccYear === reportYear;
      return matchesDivision && matchesYear;
    });
  }, [sessions, reportDivision, reportYear]);

  const reportSession = useMemo(
    () => sessions.find((s) => s.id === reportSessionId),
    [sessions, reportSessionId],
  );

  // Create session handler
  async function onCreateSession(e: React.FormEvent) {
    e.preventDefault();
    const creatorUid = currentUser?.uid || userProfile?.uid;
    if (!gDivision || !gYear || !gTitle || !gDate || !creatorUid) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setCreating(true);
      const formData: SessionFormData = {
        divisionId: gDivision,
        nccYear: gYear,
        title: gTitle,
        date: gDate,
        category: gTitleType === "Theory" ? "Theory Class" : gTitleType,
        ...(gDoubleParade ? { paradeCount: 2 } : {}),
        ...(gOfficialParade ? { isOfficialParade: true } : {}),
      };

      const id = await createSession(
        formData,
        creatorUid,
        eligibleCadets.length,
      );
      toast.success("Session created");
      setGDoubleParade(false);
      setGOfficialParade(false);
      setSelectedSessionId(id);
      setActiveTab("marker");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to create session");
    } finally {
      setCreating(false);
    }
  }

  // Delete session handler
  async function onDeleteSession(sessionId: string) {
    try {
      await deleteSession(sessionId);
      toast.success("Session deleted");
      setDeleteConfirmSessionId(null);
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to delete session");
    }
  }

  // Export PDF
  async function exportPdf() {
    if (!reportDivision || !reportYear) {
      toast.error("Select division and year");
      return;
    }

    const targetSessions = filteredSessions;
    if (!targetSessions.length) {
      toast.error("No sessions found");
      return;
    }

    try {
      setExportingPdf(true);
      const pdf = new jsPDF();
      let yPos = 20;
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = 15;

      pdf.setFontSize(16);
      pdf.text(
        `Attendance Report - ${reportYear} (${reportDivision})`,
        marginLeft,
        yPos,
      );
      yPos += 10;

      pdf.setFontSize(10);
      pdf.text(`Generated: ${formatISTDateTime(new Date())}`, marginLeft, yPos);
      yPos += 10;

      for (const session of targetSessions) {
        if (yPos > pageHeight - 40) {
          pdf.addPage();
          yPos = 20;
        }

        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text(`${session.date} - ${session.title}`, marginLeft, yPos);
        yPos += 6;

        const marksForSession = await listMarks(session.id!);
        const markMap = new Map(marksForSession.map((m) => [m.cadetId, m]));
        const sessionCadets = cadets.filter(
          (c) =>
            c.division === session.divisionId &&
            normalizeNccYear(c.nccYear) === session.nccYear,
        );

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);

        sessionCadets.forEach((c, idx) => {
          if (yPos > pageHeight - 15) {
            pdf.addPage();
            yPos = 20;
          }
          const m = markMap.get(c.id);
          const status = m?.status || "A";
          pdf.text(`${idx + 1}. ${c.name} - ${status}`, marginLeft, yPos);
          yPos += 5;
        });

        yPos += 5;
      }

      pdf.save(`${reportYear}_${reportDivision}_attendance.pdf`);
      toast.success("PDF exported");
    } catch (e: any) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setExportingPdf(false);
    }
  }

  // Export Excel
  async function exportExcel() {
    if (!reportDivision || !reportYear) {
      toast.error("Select division and year");
      return;
    }

    const targetSessions = filteredSessions;
    if (!targetSessions.length) {
      toast.error("No sessions found");
      return;
    }

    try {
      setExportingExcel(true);
      const workbook = XLSX.utils.book_new();

      for (const session of targetSessions) {
        const marksForSession = await listMarks(session.id!);
        const markMap = new Map(marksForSession.map((m) => [m.cadetId, m]));
        const sessionCadets = cadets.filter(
          (c) =>
            c.division === session.divisionId &&
            normalizeNccYear(c.nccYear) === session.nccYear,
        );

        const tableData = sessionCadets.map((c, idx) => {
          const m = markMap.get(c.id);
          return {
            "#": idx + 1,
            Name: c.name,
            "Reg No": c.registerNumber || "",
            Status: m?.status || "A",
            Timestamp: m?.markedAt ? formatISTDateTime(m.markedAt) : "-",
          };
        });

        const worksheet = XLSX.utils.json_to_sheet(tableData);
        worksheet["!cols"] = [
          { wch: 5 },
          { wch: 20 },
          { wch: 15 },
          { wch: 8 },
          { wch: 20 },
        ];

        const sheetName = session.date
          .replace(/[/:*?"<>|]/g, "-")
          .substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      XLSX.writeFile(
        workbook,
        `${reportYear}_${reportDivision}_attendance.xlsx`,
      );
      toast.success("Excel exported");
    } catch (e: any) {
      console.error(e);
      toast.error("Export failed");
    } finally {
      setExportingExcel(false);
    }
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center py-5">
        <Spinner as="span" animation="border" size="sm" />
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h2 className="mb-3">Attendance Management</h2>

      <Tabs
        id="attendance-tabs"
        activeKey={activeTab}
        onSelect={(k: string | null) => setActiveTab(k || "dashboard")}
        className="mb-3"
      >
        {canManageAttendance && (
          <Tab eventKey="dashboard" title="Dashboard">
            <AdminDashboard
              sessions={sessions}
              cadets={cadets}
              loading={loading}
            />
          </Tab>
        )}

        {canViewOwnAttendanceTab && (
          <Tab eventKey="my-attendance" title="My Attendance">
            <AttendanceView />
          </Tab>
        )}

        {canManageAttendance && (
          <Tab eventKey="sessions" title="Sessions">
            <Row className="g-4 align-items-start mb-4">
              <Col lg={6}>
                <Card className="h-100">
                  <Card.Header className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
                    <h5 className="mb-0">Create New Session</h5>
                    <div className="d-flex align-items-center gap-3">
                      <small className="text-muted">
                        Eligible Cadets:{" "}
                        <strong>{eligibleCadets.length}</strong>
                      </small>
                      <Button
                        type="submit"
                        form="create-session-form"
                        disabled={creating || !eligibleCadets.length}
                        size="sm"
                      >
                        {creating ? "Creating..." : "Create Session"}
                      </Button>
                    </div>
                  </Card.Header>
                  <Card.Body>
                    <Form id="create-session-form" onSubmit={onCreateSession}>
                      <div className="mb-3">
                        <BatchSelector
                          divisionId={gDivision}
                          nccYear={gYear}
                          onDivisionChange={setGDivision}
                          onYearChange={setGYear}
                          required
                        />
                      </div>

                      <Row className="g-3">
                        <Col md={7}>
                          <Form.Group>
                            <Form.Label>Title</Form.Label>
                            <Form.Select
                              value={gTitleType}
                              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                                const value = e.target.value as AttendanceSessionTitle;
                                setGTitleType(value);
                                setGTitle(value === "Other" ? "" : value);
                              }}
                            >
                              {ATTENDANCE_SESSION_TITLE_OPTIONS.map((title) => (
                                <option key={title} value={title}>
                                  {title}
                                </option>
                              ))}
                            </Form.Select>
                            {gTitleType === "Other" && (
                              <Form.Control
                                className="mt-2"
                                value={gTitle}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  setGTitle(e.target.value)
                                }
                                placeholder="Enter a custom title"
                                required
                              />
                            )}
                          </Form.Group>
                        </Col>
                        <Col md={5}>
                          <Form.Group>
                            <Form.Label>Date</Form.Label>
                            <Form.Control
                              type="date"
                              value={gDate}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setGDate(e.target.value)
                              }
                              required
                            />
                          </Form.Group>
                        </Col>
                      </Row>

                      <div className="d-flex gap-4 mt-3">
                        <Form.Check
                          type="checkbox"
                          id="double-parade-check"
                          label="Saturday Parade (Double)"
                          checked={gDoubleParade}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setGDoubleParade(e.target.checked)
                          }
                        />
                        <Form.Check
                          type="checkbox"
                          id="official-parade-check"
                          label="Official Parade"
                          checked={gOfficialParade}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setGOfficialParade(e.target.checked)
                          }
                        />
                      </div>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={6}>
                <Card className="h-100">
                  <Card.Header>
                    <h5 className="mb-0">Recent Sessions</h5>
                  </Card.Header>
                  <Card.Body>
                    <Row className="g-3">
                      <Col md={6}>
                        <Form.Label className="mb-1">Division</Form.Label>
                        <div className="d-flex flex-wrap gap-3">
                          {DIVISIONS.map((d) => (
                            <Form.Check
                              inline
                              key={d}
                              type="radio"
                              id={`session-division-${d}`}
                              name="sessionDivisionFilter"
                              value={d}
                              label={d}
                              checked={sessionDivisionFilter === d}
                              onChange={() => setSessionDivisionFilter(d)}
                            />
                          ))}
                        </div>
                      </Col>
                      <Col md={6}>
                        <Form.Label className="mb-1">Year</Form.Label>
                        <Form.Select
                          value={sessionYearFilter}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            setSessionYearFilter(e.target.value as NccYear | "")
                          }
                          size="sm"
                        >
                          <option value="">All</option>
                          {NCC_YEARS.map((y) => (
                            <option key={y} value={y}>
                              {y.replace(" Year", "")}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col md={6}>
                        <Form.Label className="mb-1">Status</Form.Label>
                        <div className="d-flex flex-wrap gap-3">
                          <Form.Check
                            inline
                            type="radio"
                            id="session-status-open"
                            name="sessionStatusFilter"
                            value="open"
                            label="Open"
                            checked={sessionStatusFilter === "open"}
                            onChange={() => setSessionStatusFilter("open")}
                          />
                          <Form.Check
                            inline
                            type="radio"
                            id="session-status-locked"
                            name="sessionStatusFilter"
                            value="locked"
                            label="Locked"
                            checked={sessionStatusFilter === "locked"}
                            onChange={() => setSessionStatusFilter("locked")}
                          />
                        </div>
                      </Col>
                      <Col md={6}>
                        <Form.Label className="mb-1">Tags</Form.Label>
                        <div className="d-flex flex-wrap gap-3">
                          <Form.Check
                            inline
                            type="checkbox"
                            id="session-filter-official"
                            label="Official"
                            checked={sessionOfficialFilter}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setSessionOfficialFilter(e.target.checked)
                            }
                          />
                          <Form.Check
                            inline
                            type="checkbox"
                            id="session-filter-double"
                            label="Double"
                            checked={sessionDoubleFilter}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setSessionDoubleFilter(e.target.checked)
                            }
                          />
                        </div>
                      </Col>
                      <Col md={6} className="d-flex align-items-end">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => {
                            setSessionDivisionFilter("SD");
                            setSessionYearFilter("");
                            setSessionStatusFilter("open");
                            setSessionOfficialFilter(false);
                            setSessionDoubleFilter(false);
                          }}
                          className="w-100"
                        >
                          Reset Filters
                        </Button>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Card>
              <Card.Body className="p-0">
                <Table hover responsive className="mb-0">
                  <thead
                    className="bg-light"
                    style={{ borderBottom: "2px solid #dee2e6" }}
                  >
                    <tr style={{ textAlign: "center" }}>
                      <th
                        style={{
                          fontWeight: "bold",
                          padding: "0.75rem",
                          backgroundColor: "#f8f9fa",
                        }}
                      >
                        Date
                      </th>
                      <th
                        style={{
                          fontWeight: "bold",
                          padding: "0.75rem",
                          backgroundColor: "#f8f9fa",
                        }}
                      >
                        Title
                      </th>
                      <th
                        style={{
                          fontWeight: "bold",
                          padding: "0.75rem",
                          backgroundColor: "#f8f9fa",
                        }}
                      >
                        Year
                      </th>
                      <th
                        style={{
                          fontWeight: "bold",
                          padding: "0.75rem",
                          backgroundColor: "#f8f9fa",
                        }}
                      >
                        Tags
                      </th>
                      <th
                        style={{
                          fontWeight: "bold",
                          padding: "0.75rem",
                          backgroundColor: "#f8f9fa",
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecentSessions.slice(0, 20).map((s) => (
                      <tr
                        key={s.id}
                        style={{ textAlign: "center", verticalAlign: "middle" }}
                      >
                        <td style={{ textAlign: "center" }}>
                          {formatISTDate(s.date, {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })}
                        </td>
                        <td
                          style={{
                            wordBreak: "break-word",
                            whiteSpace: "normal",
                            textAlign: "center",
                          }}
                        >
                          {s.title}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {s.nccYear.replace(" Year", "")}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="d-flex gap-1 justify-content-center flex-wrap">
                            {(s.paradeCount || 1) >= 2 && (
                              <Badge
                                bg="warning"
                                text="dark"
                                className="fw-normal"
                              >
                                Double
                              </Badge>
                            )}
                            {s.isOfficialParade && (
                              <Badge bg="info" className="fw-normal">
                                Official
                              </Badge>
                            )}
                            {!(s.paradeCount && s.paradeCount >= 2) &&
                              !s.isOfficialParade && (
                                <span className="text-muted">—</span>
                              )}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="d-flex gap-1 justify-content-center">
                            <Button
                              size="sm"
                              variant="outline-primary"
                              onClick={() => {
                                setSelectedSessionId(s.id!);
                                setActiveTab("marker");
                              }}
                              title="Mark attendance"
                              aria-label="Mark attendance"
                            >
                              <i className="bi bi-clipboard-check"></i>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => setDeleteConfirmSessionId(s.id!)}
                              title="Delete session"
                              aria-label="Delete session"
                            >
                              <i className="bi bi-trash"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredRecentSessions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-muted py-4">
                          No sessions found for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Tab>
        )}

        {canManageAttendance && (
          <Tab eventKey="marker" title="Mark Attendance">
            {selectedSessionId ? (
              <BulkMarker
                sessionId={selectedSessionId}
                onClose={() => {
                  setSelectedSessionId(null);
                  setActiveTab("sessions");
                }}
              />
            ) : (
              <Card>
                <Card.Body className="text-center py-5 text-muted">
                  <i className="bi bi-clipboard-check fs-1 d-block mb-3"></i>
                  <p>
                    Select a session from the Sessions tab to start marking
                    attendance.
                  </p>
                  <Button
                    variant="outline-primary"
                    onClick={() => setActiveTab("sessions")}
                  >
                    Go to Sessions
                  </Button>
                </Card.Body>
              </Card>
            )}
          </Tab>
        )}

        {canManageAttendance && (
          <Tab eventKey="reporter" title="Reports">
            <Card className="mb-4">
              <Card.Body>
                <Row className="g-3 align-items-end">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>Division</Form.Label>
                      <Form.Select
                        value={reportDivision}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                          setReportDivision(e.target.value as Division | "")
                        }
                      >
                        <option value="">All Divisions</option>
                        {DIVISIONS.map((d) => (
                          <option key={d} value={d}>
                            {DIVISION_LABELS[d]}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>Year</Form.Label>
                      <Form.Select
                        value={reportYear}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                          setReportYear(e.target.value as NccYear | "")
                        }
                      >
                        <option value="">All Years</option>
                        {NCC_YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>Session</Form.Label>
                      <Form.Select
                        value={reportSessionId}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                          setReportSessionId(e.target.value)
                        }
                      >
                        <option value="" disabled>
                          Select Session
                        </option>
                        {filteredSessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.date} - {s.title}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3} className="d-flex gap-2">
                    <Button
                      variant="success"
                      disabled={!reportDivision || !reportYear || exportingPdf}
                      onClick={exportPdf}
                      className="flex-grow-1"
                    >
                      {exportingPdf ? <Spinner as="span" size="sm" /> : "PDF"}
                    </Button>
                    <Button
                      variant="primary"
                      disabled={
                        !reportDivision || !reportYear || exportingExcel
                      }
                      onClick={exportExcel}
                      className="flex-grow-1"
                    >
                      {exportingExcel ? (
                        <Spinner as="span" size="sm" />
                      ) : (
                        "Excel"
                      )}
                    </Button>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {reportSession && (
              <Card>
                <Card.Header>
                  <h5 className="mb-0">
                    {reportSession.title} - {reportSession.date}
                  </h5>
                  <small className="text-muted">
                    {reportSession.divisionId} | {reportSession.nccYear}
                  </small>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table hover responsive className="mb-0">
                    <thead className="bg-light">
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Reg No</th>
                        <th>Status</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cadets
                        .filter(
                          (c) =>
                            c.division === reportSession.divisionId &&
                            normalizeNccYear(c.nccYear) ===
                              reportSession.nccYear,
                        )
                        .map((c, idx) => {
                          const mark = reportMarks[c.id];
                          return (
                            <tr key={c.id}>
                              <td>{idx + 1}</td>
                              <td>{c.name}</td>
                              <td>{c.registerNumber}</td>
                              <td>
                                <Badge
                                  bg={
                                    mark?.status === "P" ? "success" : "danger"
                                  }
                                >
                                  {mark?.status || "A"}
                                </Badge>
                              </td>
                              <td>
                                {mark?.timestamp
                                  ? formatISTDateTime(mark.timestamp)
                                  : "-"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            )}
          </Tab>
        )}
      </Tabs>

      <Modal
        show={!!deleteConfirmSessionId}
        onHide={() => setDeleteConfirmSessionId(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Delete Session</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this session? This action cannot be
          undone and all associated attendance records will be removed.
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setDeleteConfirmSessionId(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              deleteConfirmSessionId && onDeleteSession(deleteConfirmSessionId)
            }
          >
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AttendanceManagement;
