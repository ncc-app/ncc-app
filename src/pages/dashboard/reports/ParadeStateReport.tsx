import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Modal,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  NCC_RANKS,
  DIVISIONS,
  DIVISION_LABELS,
} from "@/shared/config/constants";
import type { Cadet } from "@/shared/types";
import type {
  AttendanceMark,
  AttendanceSession,
} from "@/features/attendance/attendance.types";
import {
  getLockedOfficialSessionsByDate,
  listAnoUsers,
  listCadets,
  type AnoUser,
} from "@/features/attendance/service";
import { toISTDateInputValue, formatISTDate } from "@/shared/utils/dateTime";
import "./ParadeStateReport.css";

// ============ Types ============

interface ParadeFormData {
  date: string;
  paradeNumber: string;
  timeFrom: string;
  timeTo: string;
  refreshmentItems: string;
}

type AbsenteeLeaveType = "with_leave" | "without_leave";

interface AbsenteeCadet {
  cadetId: string;
  name: string;
  rank: string;
  regimentalNumber: string;
  division: string;
  nccYear: string;
  leaveType: AbsenteeLeaveType;
}

interface SessionWithMarks {
  session: AttendanceSession & { id: string };
  marks: (AttendanceMark & { id: string })[];
}

// Rank columns in parade state table order
const PARADE_RANK_COLUMNS = [
  { key: "Offr", label: "Offr" },
  { key: "SUO", label: "SUO" },
  { key: "CUO", label: "CUO" },
  { key: "CSM", label: "CSM" },
  { key: "CQMS", label: "CQMS" },
  { key: "SGT", label: "SGT" },
  { key: "CPL", label: "CPL" },
  { key: "LCPL", label: "L/CPL" },
  { key: "CDT", label: "CDT" },
  { key: "Total", label: "Total" },
] as const;

// Category rows
const PARADE_CATEGORIES = [
  { key: "on_parade", label: "Total On Parade" },
  { key: "absent_with_leave", label: "Absent with Leave (PTO)" },
  { key: "absent_without_leave", label: "Absent without Leave (PTO)" },
  { key: "grand_total", label: "Grand Total" },
] as const;

// ============ Helpers ============

/** Map a cadet's rank code to parade state column key */
function mapRankToColumn(rankCode: string): string {
  const upper = (rankCode || "").toUpperCase().trim();
  // L/CPL or LCPL
  if (upper === "L/CPL" || upper === "LCPL" || upper === "LANCE CORPORAL")
    return "LCPL";
  const found = NCC_RANKS.find(
    (r) => r.code.toUpperCase() === upper || r.name.toUpperCase() === upper,
  );
  return found ? found.code : "CDT"; // default to CDT if unknown
}

type AnoStatus = "present" | "with_leave" | "without_leave" | "none";

/** Build rank-wise count maps */
function computeRankCounts(
  sessionsData: SessionWithMarks[],
  cadetsMap: Map<string, Cadet & { id: string }>,
  absentees: AbsenteeCadet[],
  anoStatuses: Record<string, AnoStatus>,
) {
  const onParade: Record<string, number | string> = {};
  const absentWithLeave: Record<string, number | string> = {};
  const absentWithoutLeave: Record<string, number | string> = {};
  const grandTotal: Record<string, number | string> = {};

  // Initialize all rank columns to 0
  PARADE_RANK_COLUMNS.forEach(({ key }) => {
    onParade[key] = 0;
    absentWithLeave[key] = 0;
    absentWithoutLeave[key] = 0;
    grandTotal[key] = 0;
  });

  // Deduplicate present cadets by ID
  const presentCadets = new Set<string>();
  sessionsData.forEach(({ marks }) => {
    marks.forEach((mark) => {
      if (mark.status === "P") presentCadets.add(mark.cadetId);
    });
  });

  // Count present cadets by rank
  presentCadets.forEach((cadetId) => {
    const cadet = cadetsMap.get(cadetId);
    if (!cadet) return;
    const col = mapRankToColumn(cadet.rank);
    onParade[col] = ((onParade[col] as number) || 0) + 1;
  });

  // Add ANO counts to Offr column
  const anoPresent = Object.values(anoStatuses).filter(
    (s) => s === "present",
  ).length;
  const anoWithLeave = Object.values(anoStatuses).filter(
    (s) => s === "with_leave",
  ).length;
  const anoWithoutLeave = Object.values(anoStatuses).filter(
    (s) => s === "without_leave",
  ).length;

  onParade["Offr"] = ((onParade["Offr"] as number) || 0) + anoPresent;
  absentWithLeave["Offr"] =
    ((absentWithLeave["Offr"] as number) || 0) + anoWithLeave;
  absentWithoutLeave["Offr"] =
    ((absentWithoutLeave["Offr"] as number) || 0) + anoWithoutLeave;

  // Count absent by leave type and rank
  absentees.forEach((ab) => {
    const col = mapRankToColumn(ab.rank);
    if (ab.leaveType === "with_leave") {
      absentWithLeave[col] = ((absentWithLeave[col] as number) || 0) + 1;
    } else {
      absentWithoutLeave[col] = ((absentWithoutLeave[col] as number) || 0) + 1;
    }
  });

  // Compute totals for each rank column
  PARADE_RANK_COLUMNS.forEach(({ key }) => {
    if (key === "Total") return;
    grandTotal[key] =
      ((onParade[key] as number) || 0) +
      ((absentWithLeave[key] as number) || 0) +
      ((absentWithoutLeave[key] as number) || 0);
  });

  // Compute row totals separating Cadets and Officers
  const computeRowTotal = (row: Record<string, number | string>) => {
    let cadetTotal = 0;
    let offrTotal = 0;
    PARADE_RANK_COLUMNS.forEach(({ key }) => {
      if (key === "Total") return;
      if (key === "Offr") {
        offrTotal = (row[key] as number) || 0;
      } else {
        cadetTotal += (row[key] as number) || 0;
      }
    });
    if (offrTotal > 0) {
      return `${cadetTotal} + ${offrTotal}`;
    }
    return cadetTotal;
  };

  onParade["Total"] = computeRowTotal(onParade);
  absentWithLeave["Total"] = computeRowTotal(absentWithLeave);
  absentWithoutLeave["Total"] = computeRowTotal(absentWithoutLeave);
  grandTotal["Total"] = computeRowTotal(grandTotal);

  return {
    on_parade: onParade,
    absent_with_leave: absentWithLeave,
    absent_without_leave: absentWithoutLeave,
    grand_total: grandTotal,
  };
}

// ============ Main Component ============

const ParadeStateReport: React.FC = () => {
  const navigate = useNavigate();
  const initialized = useRef(false);

  // Form state
  const [formData, setFormData] = useState<ParadeFormData>({
    date: toISTDateInputValue(),
    paradeNumber: "",
    timeFrom: "",
    timeTo: "",
    refreshmentItems: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Data state
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [allCadets, setAllCadets] = useState<(Cadet & { id: string })[]>([]);
  const [anoUsers, setAnoUsers] = useState<AnoUser[]>([]);
  const [sessionsData, setSessionsData] = useState<SessionWithMarks[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [anoStatuses, setAnoStatuses] = useState<Record<string, AnoStatus>>({});
  const [absenteeLeaveTypes, setAbsenteeLeaveTypes] = useState<
    Record<string, AbsenteeLeaveType>
  >({});
  const [dataFetched, setDataFetched] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // ---- Initial load (ANOs + cadets) ----
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [cadetsResult, anosResult] = await Promise.all([
        listCadets(),
        listAnoUsers(),
      ]);
      setAllCadets(cadetsResult);
      setAnoUsers(anosResult);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load initial data");
    } finally {
      setLoading(false);
    }
  };

  // Cadets map for quick lookup
  const cadetsMap = useMemo(() => {
    const map = new Map<string, Cadet & { id: string }>();
    allCadets.forEach((c) => map.set(c.id, c));
    return map;
  }, [allCadets]);

  // ---- Form handlers ----
  const handleFormChange = (field: keyof ParadeFormData, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      setFormErrors((prevErrors) => {
        const nextErrors = { ...prevErrors };
        delete nextErrors[field];

        // Time validation
        if (field === "timeFrom" || field === "timeTo") {
          const from = field === "timeFrom" ? value : prev.timeFrom;
          const to = field === "timeTo" ? value : prev.timeTo;
          if (from && to && from > to) {
            nextErrors.timeTo = "To time cannot be before From time";
            nextErrors.timeFrom = "From time cannot be after To time";
          } else {
            delete nextErrors.timeTo;
            delete nextErrors.timeFrom;
            // Re-add empty checks only if user has interacted
            if (field === "timeFrom" && !value)
              nextErrors.timeFrom = "From time is required";
            if (field === "timeTo" && !value)
              nextErrors.timeTo = "To time is required";
          }
        }

        return nextErrors;
      });

      return next;
    });

    // Reset fetched data when date changes
    if (field === "date") {
      setSessionsData([]);
      setSelectedSessionIds(new Set());
      setAbsenteeLeaveTypes({});
      setAnoStatuses({});
      setDataFetched(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.date) errors.date = "Date is required";
    if (!formData.paradeNumber.trim())
      errors.paradeNumber = "Parade number is required";
    if (!formData.timeFrom) errors.timeFrom = "From time is required";
    if (!formData.timeTo) errors.timeTo = "To time is required";
    if (
      formData.timeFrom &&
      formData.timeTo &&
      formData.timeFrom > formData.timeTo
    ) {
      errors.timeFrom = "From time cannot be after To time";
      errors.timeTo = "To time cannot be before From time";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ---- Fetch attendance data for selected date ----
  const fetchAttendanceData = async () => {
    if (!formData.date) {
      toast.error("Please select a date first");
      return;
    }

    setFetching(true);
    try {
      const results = await getLockedOfficialSessionsByDate(formData.date);

      if (results.length === 0) {
        toast.error("No locked official parade sessions found for this date");
        setSessionsData([]);
        setSelectedSessionIds(new Set());
        setAbsenteeLeaveTypes({});
        setDataFetched(true);
        return;
      }

      // Validate: check that for each year present, BOTH SD and SW are found
      const sessionKeys = new Set(
        results.map((r) => `${r.session.divisionId}-${r.session.nccYear}`),
      );
      const sessionYears = new Set(results.map((r) => r.session.nccYear));
      const missingKeys: string[] = [];

      sessionYears.forEach((year) => {
        DIVISIONS.forEach((div) => {
          const key = `${div}-${year}`;
          if (!sessionKeys.has(key)) {
            missingKeys.push(`${DIVISION_LABELS[div]} ${year}`);
          }
        });
      });

      if (missingKeys.length > 0) {
        toast.error(
          `Missing locked official sessions for: ${missingKeys.join(", ")}. Need both SD and SW for each selected year.`,
          { duration: 6000 },
        );
      }

      setSessionsData(results);
      setSelectedSessionIds(new Set(results.map((r) => r.session.id)));
      setAbsenteeLeaveTypes({});
      setDataFetched(true);

      toast.success(`Found ${results.length} session(s)`);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to fetch attendance data");
    } finally {
      setFetching(false);
    }
  };

  const setAnoStatus = (uid: string, status: AnoStatus) => {
    setAnoStatuses((prev) => ({ ...prev, [uid]: status }));
  };

  const toggleSession = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  // ---- Derived State ----
  const selectedSessions = useMemo(
    () => sessionsData.filter((s) => selectedSessionIds.has(s.session.id)),
    [sessionsData, selectedSessionIds],
  );

  const sessionValidation = useMemo(() => {
    if (selectedSessions.length === 0) {
      return {
        isValid: false,
        missingKeys: ["Select at least one session"],
        selectedCount: 0,
      };
    }

    const selectedKeys = new Set(
      selectedSessions.map(
        (s) => `${s.session.divisionId}-${s.session.nccYear}`,
      ),
    );
    const selectedYears = new Set(
      selectedSessions.map((s) => s.session.nccYear),
    );
    const missingKeys: string[] = [];

    // Duplicate check
    const duplicates = new Set<string>();
    const seen = new Set<string>();
    selectedSessions.forEach((s) => {
      const key = `${s.session.divisionId}-${s.session.nccYear}`;
      if (seen.has(key))
        duplicates.add(
          `${DIVISION_LABELS[s.session.divisionId as keyof typeof DIVISION_LABELS]} ${s.session.nccYear}`,
        );
      seen.add(key);
    });

    // For every year that was selected, make sure BOTH SD and SW are present
    selectedYears.forEach((year) => {
      DIVISIONS.forEach((div) => {
        const key = `${div}-${year}`;
        if (!selectedKeys.has(key)) {
          missingKeys.push(
            `${DIVISION_LABELS[div as keyof typeof DIVISION_LABELS]} ${year}`,
          );
        }
      });
    });

    const errors: string[] = [];
    if (missingKeys.length > 0)
      errors.push(`Missing pairs: ${missingKeys.join(", ")}`);
    if (duplicates.size > 0)
      errors.push(
        `Multiple sessions selected for: ${Array.from(duplicates).join(", ")}`,
      );

    const isValid = missingKeys.length === 0 && duplicates.size === 0;
    return {
      isValid,
      missingKeys: errors,
      selectedCount: selectedSessions.length,
    };
  }, [selectedSessions]);

  const absentees = useMemo(() => {
    const presentCadets = new Set<string>();
    selectedSessions.forEach(({ marks }) => {
      marks.forEach((mark) => {
        if (mark.status === "P") presentCadets.add(mark.cadetId);
      });
    });

    const absentMap = new Map<string, AbsenteeCadet>();
    selectedSessions.forEach(({ marks }) => {
      marks.forEach((mark) => {
        if (mark.status === "A" && !presentCadets.has(mark.cadetId)) {
          if (!absentMap.has(mark.cadetId)) {
            const cadet = cadetsMap.get(mark.cadetId);
            if (cadet) {
              absentMap.set(mark.cadetId, {
                cadetId: mark.cadetId,
                name: cadet.name,
                rank: cadet.rank || "CDT",
                regimentalNumber: cadet.regimentalNumber || "-",
                division: cadet.division || "-",
                nccYear: cadet.nccYear || "-",
                leaveType: absenteeLeaveTypes[mark.cadetId] || "without_leave",
              });
            }
          }
        }
      });
    });

    const absentList = Array.from(absentMap.values());
    absentList.sort((a, b) => a.name.localeCompare(b.name));
    return absentList;
  }, [selectedSessions, cadetsMap, absenteeLeaveTypes]);

  // ---- Absentee Classification ----
  const setAbsenteeLeaveType = (
    cadetId: string,
    leaveType: AbsenteeLeaveType,
  ) => {
    setAbsenteeLeaveTypes((prev) => ({ ...prev, [cadetId]: leaveType }));
  };

  const setAllAbsenteesLeaveType = (leaveType: AbsenteeLeaveType) => {
    const next: Record<string, AbsenteeLeaveType> = {};
    absentees.forEach((ab) => {
      next[ab.cadetId] = leaveType;
    });
    setAbsenteeLeaveTypes((prev) => ({ ...prev, ...next }));
  };

  const rankCounts = useMemo(() => {
    return computeRankCounts(
      selectedSessions,
      cadetsMap,
      absentees,
      anoStatuses,
    );
  }, [selectedSessions, cadetsMap, anoStatuses, absentees]);

  // ---- Preview ----
  const handlePreview = () => {
    if (!validateForm()) {
      toast.error("Please fill all required fields");
      return;
    }
    if (sessionsData.length === 0) {
      toast.error("Please fetch attendance data first");
      return;
    }

    if (!sessionValidation.isValid) {
      toast.error(
        `Session constraint error: Missing ${sessionValidation.missingKeys.length > 0 ? sessionValidation.missingKeys.join(", ") : "None"}. Selected: ${sessionValidation.selectedCount}`,
        { duration: 4000 },
      );
      return;
    }

    setShowPreview(true);
  };

  // ---- Render ----
  if (loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner as="span" animation="border" size="sm" />
        <p className="mt-3">Loading data...</p>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <Row className="mb-3">
        <Col>
          <h2 className="mb-1">Parade State Report Generator</h2>
          <p className="text-muted mb-0">
            Generate official NCC Parade State from locked official parade
            attendance sessions.
          </p>
        </Col>
      </Row>

      <Row className="g-3">
        {/* ---- Step 1: Meta Data ---- */}
        <Col lg={12}>
          <Card className="shadow-sm">
            <Card.Header className="bg-primary text-white d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
              <span>
                <i className="bi bi-journal-text me-2" />
                Step 1 — Parade Meta Data
              </span>
              <Button variant="light" size="sm" onClick={() => navigate(-1)}>
                <i className="bi bi-arrow-left me-1" /> Back
              </Button>
            </Card.Header>
            <Card.Body>
              <Form>
                <Row className="g-3">
                  <Col xs={12} md={3}>
                    <Form.Group controlId="psDate">
                      <Form.Label>Date *</Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.date}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleFormChange("date", e.target.value)
                        }
                        isInvalid={Boolean(formErrors.date)}
                      />
                      {formErrors.date && (
                        <Form.Text className="text-danger d-block">
                          {formErrors.date}
                        </Form.Text>
                      )}
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={3}>
                    <Form.Group controlId="psParadeNumber">
                      <Form.Label>Parade Number *</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g. 01"
                        value={formData.paradeNumber}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleFormChange("paradeNumber", e.target.value)
                        }
                        isInvalid={Boolean(formErrors.paradeNumber)}
                      />
                      {formErrors.paradeNumber && (
                        <Form.Text className="text-danger d-block">
                          {formErrors.paradeNumber}
                        </Form.Text>
                      )}
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={3}>
                    <Form.Group controlId="psTimeFrom">
                      <Form.Label>Time From *</Form.Label>
                      <Form.Control
                        type="time"
                        value={formData.timeFrom}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleFormChange("timeFrom", e.target.value)
                        }
                        isInvalid={Boolean(formErrors.timeFrom)}
                      />
                      {formErrors.timeFrom && (
                        <Form.Text className="text-danger d-block">
                          {formErrors.timeFrom}
                        </Form.Text>
                      )}
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={3}>
                    <Form.Group controlId="psTimeTo">
                      <Form.Label>Time To *</Form.Label>
                      <Form.Control
                        type="time"
                        value={formData.timeTo}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleFormChange("timeTo", e.target.value)
                        }
                        isInvalid={Boolean(formErrors.timeTo)}
                      />
                      {formErrors.timeTo && (
                        <Form.Text className="text-danger d-block">
                          {formErrors.timeTo}
                        </Form.Text>
                      )}
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group controlId="psRefreshment">
                      <Form.Label>Refreshment Items</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g. Tea, Biscuits"
                        value={formData.refreshmentItems}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleFormChange("refreshmentItems", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6} className="d-flex align-items-end">
                    <Button
                      variant="success"
                      onClick={fetchAttendanceData}
                      disabled={!formData.date || fetching}
                      className="w-100"
                    >
                      {fetching ? (
                        <>Fetching...</>
                      ) : (
                        <>
                          <i className="bi bi-cloud-download me-2" />
                          Fetch Attendance Data for{" "}
                          {formData.date
                            ? formatISTDate(formData.date, {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "selected date"}
                        </>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* ---- Step 2: Session Summary ---- */}
        {dataFetched && (
          <Col lg={12}>
            <Card className="shadow-sm">
              <Card.Header className="bg-secondary text-white">
                <i className="bi bi-clipboard-check me-2" />
                Step 2 — Sessions Found
              </Card.Header>
              <Card.Body>
                {sessionsData.length === 0 ? (
                  <Alert variant="warning" className="mb-0">
                    No locked official parade sessions found for{" "}
                    {formatISTDate(formData.date, {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                    . Make sure sessions are created, marked as Official Parade,
                    and locked.
                  </Alert>
                ) : (
                  <>
                    <p className="text-muted small mb-2">
                      Select which sessions to include. By default, all locked
                      official sessions for the date are selected. If a cadet
                      attended any selected session, they are marked Present.
                    </p>

                    {!sessionValidation.isValid && (
                      <Alert variant="danger" className="py-2 px-3 small">
                        <strong>Session Constraint Error:</strong>
                        <br />
                        {sessionValidation.missingKeys.map((err, i) => (
                          <div key={i}>{err}</div>
                        ))}
                      </Alert>
                    )}
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      {sessionsData.map(({ session }) => (
                        <div
                          key={session.id}
                          className="d-inline-block border rounded p-2 bg-light"
                        >
                          <Form.Check
                            type="checkbox"
                            id={`session-${session.id}`}
                            label={
                              <span>
                                <strong>
                                  {session.divisionId} - {session.nccYear}
                                </strong>
                                <br />
                                <small className="text-muted">
                                  {session.stats.present}P /{" "}
                                  {session.stats.absent}A
                                </small>
                              </span>
                            }
                            checked={selectedSessionIds.has(session.id)}
                            onChange={() => toggleSession(session.id)}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="text-muted small">
                      <strong>{selectedSessionIds.size}</strong> out of{" "}
                      {sessionsData.length} session(s) selected.
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        )}

        {/* ---- Step 3: ANO Selection ---- */}
        {dataFetched && sessionsData.length > 0 && (
          <Col lg={12}>
            <Card className="shadow-sm h-100 mb-3">
              <Card.Header className="bg-info text-white">
                <i className="bi bi-person-badge me-2" />
                Step 3 — ANO Selection (Offr)
              </Card.Header>
              <Card.Body>
                {anoUsers.length === 0 ? (
                  <Alert variant="info" className="mb-0">
                    No active ANO users found in the system.
                  </Alert>
                ) : (
                  <>
                    <p className="text-muted small mb-2">
                      Classify ANO status. Their count will appear in the "Offr"
                      column under the respective category.
                    </p>
                    <Table size="sm" hover className="mb-0">
                      <thead>
                        <tr>
                          <th>ANO Name</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anoUsers.map((ano) => {
                          const status = anoStatuses[ano.uid] || "none";
                          return (
                            <tr key={ano.uid}>
                              <td className="align-middle">
                                {ano.name} ({ano.email})
                              </td>
                              <td>
                                <div className="d-flex gap-3 flex-wrap">
                                  <Form.Check
                                    type="radio"
                                    id={`ano-${ano.uid}-none`}
                                    label="None / N/A"
                                    name={`ano-${ano.uid}`}
                                    checked={status === "none"}
                                    onChange={() =>
                                      setAnoStatus(ano.uid, "none")
                                    }
                                  />
                                  <Form.Check
                                    type="radio"
                                    id={`ano-${ano.uid}-present`}
                                    label="Present"
                                    name={`ano-${ano.uid}`}
                                    checked={status === "present"}
                                    onChange={() =>
                                      setAnoStatus(ano.uid, "present")
                                    }
                                  />
                                  <Form.Check
                                    type="radio"
                                    id={`ano-${ano.uid}-with_leave`}
                                    label="Absent with Leave"
                                    name={`ano-${ano.uid}`}
                                    checked={status === "with_leave"}
                                    onChange={() =>
                                      setAnoStatus(ano.uid, "with_leave")
                                    }
                                  />
                                  <Form.Check
                                    type="radio"
                                    id={`ano-${ano.uid}-without_leave`}
                                    label="Absent without Leave"
                                    name={`ano-${ano.uid}`}
                                    checked={status === "without_leave"}
                                    onChange={() =>
                                      setAnoStatus(ano.uid, "without_leave")
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        )}

        {/* ---- Step 4: Absentee Classification ---- */}
        {dataFetched && sessionsData.length > 0 && (
          <Col lg={12}>
            <Card className="shadow-sm h-100 mb-3">
              <Card.Header className="bg-warning text-dark d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
                <span>
                  <i className="bi bi-person-x me-2" />
                  Step 4 — Classify Absentees ({absentees.length})
                </span>
                {absentees.length > 0 && (
                  <div className="d-flex gap-1">
                    <Button
                      variant="outline-dark"
                      size="sm"
                      onClick={() => setAllAbsenteesLeaveType("with_leave")}
                    >
                      All With Leave
                    </Button>
                    <Button
                      variant="outline-dark"
                      size="sm"
                      onClick={() => setAllAbsenteesLeaveType("without_leave")}
                    >
                      All Without Leave
                    </Button>
                  </div>
                )}
              </Card.Header>
              <Card.Body>
                {absentees.length === 0 ? (
                  <Alert variant="success" className="mb-0">
                    No absentees found — 100% attendance!
                  </Alert>
                ) : (
                  <div className="ps-absentee-classify">
                    <Table size="sm" hover className="mb-0">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Rank</th>
                          <th>Reg No</th>
                          <th>Leave Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {absentees.map((ab, idx) => (
                          <tr key={ab.cadetId}>
                            <td className="align-middle">{idx + 1}</td>
                            <td className="align-middle">{ab.name}</td>
                            <td className="align-middle">
                              <Badge bg="secondary">{ab.rank}</Badge>
                            </td>
                            <td className="small align-middle">
                              {ab.regimentalNumber}
                            </td>
                            <td>
                              <div className="d-flex gap-3">
                                <Form.Check
                                  type="radio"
                                  id={`absentee-${ab.cadetId}-with`}
                                  label="With Leave"
                                  name={`absentee-${ab.cadetId}`}
                                  checked={ab.leaveType === "with_leave"}
                                  onChange={() =>
                                    setAbsenteeLeaveType(
                                      ab.cadetId,
                                      "with_leave",
                                    )
                                  }
                                />
                                <Form.Check
                                  type="radio"
                                  id={`absentee-${ab.cadetId}-without`}
                                  label="Without Leave"
                                  name={`absentee-${ab.cadetId}`}
                                  checked={ab.leaveType === "without_leave"}
                                  onChange={() =>
                                    setAbsenteeLeaveType(
                                      ab.cadetId,
                                      "without_leave",
                                    )
                                  }
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        )}

        {/* ---- Rank Summary Preview ---- */}
        {dataFetched && sessionsData.length > 0 && (
          <Col lg={12}>
            <Card className="shadow-sm">
              <Card.Header className="bg-dark text-white">
                <i className="bi bi-table me-2" />
                Rank-wise Summary
              </Card.Header>
              <Card.Body className="p-0">
                <div className="table-responsive">
                  <Table bordered size="sm" className="mb-0 text-center">
                    <thead>
                      <tr className="table-dark">
                        <th className="text-start ps-3">Category</th>
                        {PARADE_RANK_COLUMNS.map(({ key, label }) => (
                          <th key={key}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PARADE_CATEGORIES.map(({ key, label }) => (
                        <tr key={key}>
                          <td className="text-start fw-semibold ps-3">
                            {label}
                          </td>
                          {PARADE_RANK_COLUMNS.map(({ key: col }) => (
                            <td key={col}>
                              {rankCounts[key as keyof typeof rankCounts][
                                col
                              ] || 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </Card.Body>
              <Card.Footer className="d-flex justify-content-end">
                <Button
                  variant="primary"
                  onClick={handlePreview}
                  disabled={
                    sessionsData.length === 0 || !sessionValidation.isValid
                  }
                >
                  <i className="bi bi-eye me-2" />
                  Preview Parade State
                </Button>
              </Card.Footer>
            </Card>
          </Col>
        )}
      </Row>

      {/* ---- Preview Modal ---- */}
      <ParadeStatePreview
        show={showPreview}
        onHide={() => setShowPreview(false)}
        formData={formData}
        rankCounts={rankCounts}
        absentees={absentees}
      />
    </Container>
  );
};

// ============ Preview Component ============

interface PreviewProps {
  show: boolean;
  onHide: () => void;
  formData: ParadeFormData;
  rankCounts: ReturnType<typeof computeRankCounts>;
  absentees: AbsenteeCadet[];
}

const ParadeStatePreview: React.FC<PreviewProps> = ({
  show,
  onHide,
  formData,
  rankCounts,
  absentees,
}) => {
  const formatTime = (time: string) => {
    if (!time) return "-";
    const [h, m] = time.split(":");
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${suffix}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return formatISTDate(
      dateStr,
      { day: "2-digit", month: "long", year: "numeric" },
      "en-GB",
    );
  };

  const absenteesWithLeave = absentees.filter(
    (a) => a.leaveType === "with_leave",
  );
  const absenteesWithoutLeave = absentees.filter(
    (a) => a.leaveType === "without_leave",
  );
  const maxAbsenteeRows = Math.max(
    absenteesWithLeave.length,
    absenteesWithoutLeave.length,
    14,
  );

  const handlePrint = () => {
    const originalTitle = document.title;
    const dateStr = formData.date ? formatDate(formData.date) : "Unknown Date";
    document.title = `${dateStr} Parade State`;

    setTimeout(() => {
      window.print();
      document.title = originalTitle;
      onHide();
    }, 100);
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      fullscreen="lg-down"
      className="ps-preview-modal"
    >
      <Modal.Header closeButton className="ps-no-print">
        <Modal.Title>Parade State Preview</Modal.Title>
      </Modal.Header>
      <Modal.Body className="ps-preview-body">
        <div className="ps-print-area">
          {/* ---- Page 1: Main Parade State ---- */}
          <div className="ps-page">
            <div className="ps-title">PARADE STATE</div>

            {/* Meta */}
            <div
              className="ps-meta"
              style={{ marginBottom: "15px", lineHeight: "2.5" }}
            >
              {/* Row 1 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "20px",
                }}
              >
                <div style={{ display: "flex" }}>
                  <span
                    style={{
                      fontWeight: "bold",
                      marginRight: "8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Institution:
                  </span>
                  <span>
                    <u>
                      <strong>THIAGARAJAR COLLEGE OF ENGINEERING</strong>
                    </u>
                  </span>
                </div>
                <div style={{ display: "flex" }}>
                  <span
                    style={{
                      fontWeight: "bold",
                      marginRight: "8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Parade No:
                  </span>
                  <span>
                    <u>
                      <strong>{formData.paradeNumber || " "}</strong>
                    </u>
                  </span>
                </div>
              </div>

              {/* Row 2 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "20px",
                }}
              >
                <div style={{ display: "flex" }}>
                  <span
                    style={{
                      fontWeight: "bold",
                      marginRight: "8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Troop/ Company No:
                  </span>
                  <span>
                    <u>
                      <strong>4(TN) ENGR COY NCC</strong>
                    </u>
                  </span>
                </div>
                <div style={{ display: "flex" }}>
                  <span
                    style={{
                      fontWeight: "bold",
                      marginRight: "8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Time:
                  </span>
                  <span>
                    <u>
                      <strong>
                        {formData.timeFrom && formData.timeTo
                          ? `${formatTime(formData.timeFrom)} to ${formatTime(formData.timeTo)}`
                          : " "}
                      </strong>
                    </u>
                  </span>
                </div>
                <div style={{ display: "flex" }}>
                  <span
                    style={{
                      fontWeight: "bold",
                      marginRight: "8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Date:
                  </span>
                  <span>
                    <u>
                      <strong>
                        {formData.date ? formatDate(formData.date) : " "}
                      </strong>
                    </u>
                  </span>
                </div>
              </div>
            </div>

            {/* Count Table */}
            <table className="ps-count-table">
              <thead>
                <tr>
                  <th>Category</th>
                  {PARADE_RANK_COLUMNS.map(({ key, label }) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PARADE_CATEGORIES.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="ps-cat-label">{label}</td>
                    {PARADE_RANK_COLUMNS.map(({ key: col }) => (
                      <td key={col}>
                        {rankCounts[key as keyof typeof rankCounts][col] || 0}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="ps-cat-label">Refreshment Items</td>
                  <td
                    colSpan={PARADE_RANK_COLUMNS.length}
                    style={{
                      textAlign: "left",
                      fontWeight: "bold",
                      paddingLeft: "12px",
                    }}
                  >
                    {formData.refreshmentItems || " "}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Signatures */}
            <div className="ps-signatures">
              <div className="ps-sig-block">
                <div className="ps-sig-line">Signature of Instructor</div>
                <div className="ps-sig-subtitle">(No, Rank &amp; Name)</div>
              </div>

              <div className="ps-sig-block">
                <div className="ps-sig-line">Signature of the ANO/CTO</div>
                <div className="ps-sig-subtitle">(With seal)</div>
                <div className="ps-countersigned"><u>COUNTERSIGNED</u></div>
              </div>
              <div className="ps-sig-block">
                <div className="ps-sig-line">Signature of Head of the Institution</div>
                <div className="ps-sig-subtitle">(With seal)</div>
              </div>
            </div>

            {/* Notes */}
            <div
              className="ps-notes"
              style={{
                marginTop: "20px",
                textAlign: "justify",
                lineHeight: "1.5",
              }}
            >
              <strong>Note:</strong>{" "}
              <span style={{ marginLeft: "4px" }}>
                This parade state will be submitted to 4 (TN) Engr Coy NCC,
                Madurai by 10am of the following day. A member of regular Indian
                Instructional Staff will sign in this place and none else. If no
                such Instructor on parade, the space will be left blank. The
                entry relevant to the unit should be retained and others, scored
                out when the form filled in.
              </span>
            </div>

            {/* ---- Roll of Absentees ---- */}
            <div className="ps-absentee-title">ROLL OF ABSENTEES</div>

            <table className="ps-absentee-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: "5%" }}>S No</th>
                  <th colSpan={3}>Absent with Leave</th>
                  <th colSpan={3}>Absent without Leave</th>
                </tr>
                <tr>
                  <th style={{ width: "15%" }}>Regimental No</th>
                  <th style={{ width: "8%" }}>Rank</th>
                  <th style={{ width: "24.5%" }}>Name</th>
                  <th style={{ width: "15%" }}>Regimental No</th>
                  <th style={{ width: "8%" }}>Rank</th>
                  <th style={{ width: "24.5%" }}>Name</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxAbsenteeRows }, (_, i) => {
                  const withLeave = absenteesWithLeave[i];
                  const withoutLeave = absenteesWithoutLeave[i];
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{withLeave?.regimentalNumber || ""}</td>
                      <td>{withLeave?.rank || ""}</td>
                      <td className="ps-absentee-name">
                        {withLeave?.name || ""}
                      </td>
                      <td>{withoutLeave?.regimentalNumber || ""}</td>
                      <td>{withoutLeave?.rank || ""}</td>
                      <td className="ps-absentee-name">
                        {withoutLeave?.name || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="ps-no-print">
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
        <Button variant="primary" onClick={handlePrint}>
          <i className="bi bi-printer me-2" />
          Print
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ParadeStateReport;
