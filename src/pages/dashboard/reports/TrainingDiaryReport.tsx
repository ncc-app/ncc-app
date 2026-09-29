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
} from "react-bootstrap";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { DIVISIONS, DIVISION_LABELS } from "@/shared/config/constants";
import { format } from "date-fns";
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
import "./TrainingDiaryReport.css";
import type { Cadet } from "@/shared/types";

// ============ Types ============

interface TrainingDiaryFormData {
  date: string;
  anoId: string;
  timeFrom: string;
  timeTo: string;
  periods: string;
  refreshment: string;
  remarks: string;
  commonSubjects: string[];
  specialistSubjects: string[];
  institution?: string;
}

interface SessionWithMarks {
  session: AttendanceSession & { id: string };
  marks: (AttendanceMark & { id: string })[];
}

// ============ Main Component ============

const TrainingDiaryReport: React.FC = () => {
  const navigate = useNavigate();
  const initialized = useRef(false);

  // Form state
  const [formData, setFormData] = useState<TrainingDiaryFormData>({
    date: toISTDateInputValue(),
    anoId: "",
    timeFrom: "",
    timeTo: "",
    periods: "",
    refreshment: "",
    remarks: "",
    commonSubjects: [],
    specialistSubjects: [],
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Data state
  const [fetching, setFetching] = useState(false);
  const [dataFetched, setDataFetched] = useState(false);
  const [sessionsData, setSessionsData] = useState<SessionWithMarks[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [anoUsers, setAnoUsers] = useState<AnoUser[]>([]);
  const [cadetsMap, setCadetsMap] = useState<
    Map<string, Cadet & { id: string }>
  >(new Map());

  // Modal
  const [showPreview, setShowPreview] = useState(false);

  // Photo attachments
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Load initial data
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loadInitialData = async () => {
      try {
        const [anos, allCadets] = await Promise.all([
          listAnoUsers(),
          listCadets(),
        ]);

        const activeAnos = anos;
        setAnoUsers(activeAnos);

        if (activeAnos.length === 1) {
          setFormData((prev) => ({ ...prev, anoId: activeAnos[0].uid }));
        }

        const map = new Map<string, Cadet & { id: string }>();
        allCadets.forEach((c) => map.set(c.id, c));
        setCadetsMap(map);
      } catch (err) {
        console.error("Failed to load initial data:", err);
        toast.error("Failed to load ANOs or Cadets");
      }
    };

    loadInitialData();
  }, []);

  const handleFormChange = (field: keyof TrainingDiaryFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    setFormErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors[field];

      // We must check the latest values. Since state is async, use value for the current field,
      // and formData for the other field. (But formData is also from scope, so let's use a combination)
      const from = field === "timeFrom" ? value : formData.timeFrom;
      const to = field === "timeTo" ? value : formData.timeTo;

      if (field === "timeFrom" || field === "timeTo") {
        if (from && to && from > to) {
          nextErrors.timeTo = "End time cannot be before Start time";
          nextErrors.timeFrom = "Start time cannot be after End time";
        } else {
          delete nextErrors.timeTo;
          delete nextErrors.timeFrom;
          if (field === "timeFrom" && !value)
            nextErrors.timeFrom = "Start time is required";
          if (field === "timeTo" && !value)
            nextErrors.timeTo = "End time is required";
        }
      }

      return nextErrors;
    });

    // Reset fetched data when date changes
    if (field === "date") {
      setSessionsData([]);
      setSelectedSessionIds(new Set());
      setDataFetched(false);
    }
  };

  // ---- Fetch attendance data ----
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
        setDataFetched(true);
        return;
      }

      setSessionsData(results);
      setSelectedSessionIds(new Set(results.map((r) => r.session.id)));
      setDataFetched(true);

      toast.success(`Found ${results.length} session(s)`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to fetch sessions");
    } finally {
      setFetching(false);
    }
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
      DIVISIONS.forEach((div: any) => {
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

    return {
      isValid: missingKeys.length === 0 && duplicates.size === 0,
      missingKeys: errors,
      selectedCount: selectedSessions.length,
    };
  }, [selectedSessions]);

  // Compute Auth and Enrolled breakdown
  const computedStats = useMemo(() => {
    // Auth = count of present cadets, Enrolled = total cadets
    const authCadets = new Set<string>();
    const enrolledCadets = new Set<string>();
    const breakdown: Record<string, number> = {};

    selectedSessions.forEach(({ marks }) => {
      marks.forEach((mark) => {
        enrolledCadets.add(mark.cadetId);

        if (mark.status === "P") {
          authCadets.add(mark.cadetId);

          // Add to breakdown
          const cadet = cadetsMap.get(mark.cadetId);
          if (cadet) {
            const label = `${cadet.division} ${cadet.nccYear}`;
            breakdown[label] = (breakdown[label] || 0) + 1;
          }
        }
      });
    });

    // Format breakdown strings
    const breakdownLines = Object.entries(breakdown)
      .sort(([labelA], [labelB]) => {
        const yearA = parseInt(labelA.match(/(\d+)/)?.[1] || "0");
        const yearB = parseInt(labelB.match(/(\d+)/)?.[1] || "0");
        if (yearA !== yearB) return yearA - yearB;
        return labelA.localeCompare(labelB);
      })
      .map(([label, count]) => `${label}: ${count}`);

    return {
      auth: authCadets.size,
      enrolled: enrolledCadets.size,
      breakdownLines,
    };
  }, [selectedSessions, cadetsMap]);

  const toggleSession = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  // ---- Subjects Management ----
  const addSubject = (type: "common" | "specialist") => {
    setFormData((prev) => ({
      ...prev,
      [type === "common" ? "commonSubjects" : "specialistSubjects"]: [
        ...(type === "common" ? prev.commonSubjects : prev.specialistSubjects),
        "",
      ],
    }));
  };

  const updateSubject = (
    type: "common" | "specialist",
    index: number,
    value: string,
  ) => {
    setFormData((prev) => {
      const arr =
        type === "common"
          ? [...prev.commonSubjects]
          : [...prev.specialistSubjects];
      arr[index] = value;
      return {
        ...prev,
        [type === "common" ? "commonSubjects" : "specialistSubjects"]: arr,
      };
    });
  };

  const removeSubject = (type: "common" | "specialist", index: number) => {
    setFormData((prev) => {
      const arr =
        type === "common"
          ? [...prev.commonSubjects]
          : [...prev.specialistSubjects];
      arr.splice(index, 1);
      return {
        ...prev,
        [type === "common" ? "commonSubjects" : "specialistSubjects"]: arr,
      };
    });
  };

  // ---- Image Attachments ----
  const handleImageFiles = (files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) =>
      ["image/png", "image/jpeg"].includes(f.type),
    );

    const totalAfter = attachedImages.length + newFiles.length;
    if (totalAfter > 3) {
      toast.error(
        `You can attach exactly 3 photos. ${attachedImages.length} already added.`,
      );
      return;
    }

    const updatedFiles = [...attachedImages, ...newFiles];
    setAttachedImages(updatedFiles);

    // Revoke old URLs and create new ones
    imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setImagePreviewUrls(updatedFiles.map((f) => URL.createObjectURL(f)));
  };

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    handleImageFiles(e.target.files);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleImageFiles(e.dataTransfer.files);
    }
  };

  const handleImageRemove = (index: number) => {
    const updatedFiles = attachedImages.filter((_, i) => i !== index);
    setAttachedImages(updatedFiles);

    // Revoke removed URL
    URL.revokeObjectURL(imagePreviewUrls[index]);
    setImagePreviewUrls(updatedFiles.map((f) => URL.createObjectURL(f)));
  };

  // ---- Generation & Print ----
  const handleGenerate = () => {
    const errors: Record<string, string> = {};
    if (!formData.date) errors.date = "Date is required";
    if (!formData.anoId) errors.anoId = "ANO is required";
    if (!formData.timeFrom) errors.timeFrom = "Start time is required";
    if (!formData.timeTo) errors.timeTo = "End time is required";
    if (
      formData.timeFrom &&
      formData.timeTo &&
      formData.timeFrom > formData.timeTo
    ) {
      errors.timeFrom = "Start time cannot be after End time";
      errors.timeTo = "End time cannot be before Start time";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Please fill all required fields");
      return;
    }

    if (!sessionValidation.isValid) {
      toast.error("Please fix session selection errors before generating");
      return;
    }

    setShowPreview(true);
  };

  const handlePrint = () => {
    const origTitle = document.title;

    const dateObj = new Date(formData.date);
    const dateStr = !isNaN(dateObj.getTime())
      ? format(dateObj, "dd MMMM yyyy")
      : formData.date;

    document.title = `${dateStr} Training Diary`;

    setTimeout(() => {
      window.print();
      document.title = origTitle;
      setShowPreview(false);
    }, 100);
  };

  // Helpers
  const selectedAno = anoUsers.find((a) => a.uid === formData.anoId);

  return (
    <Container className="py-4 training-diary-workspace">
      <Row className="mb-3">
        <Col>
          <h2 className="mb-1">Training Diary Generator</h2>
          <p className="text-muted mb-0">
            Generate official NCC Training Diary from locked official parade
            attendance sessions.
          </p>
        </Col>
      </Row>

      <Row className="g-3">
        <Col lg={12}>
          {/* Step 1: Initial Setup */}
          <Card className="shadow-sm">
            <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
              <span>
                <i className="bi bi-gear-fill me-2" />
                Step 1 — Initial Setup
              </span>
              <Button
                variant="light"
                size="sm"
                onClick={() => navigate("/admin/reports")}
              >
                <i className="bi bi-arrow-left me-1" /> Back
              </Button>
            </Card.Header>
            <Card.Body>
              <Form>
                <Row className="g-3">
                  <Col xs={12} md={3}>
                    <Form.Group>
                      <Form.Label>Date *</Form.Label>
                      <Form.Control
                        type="date"
                        value={formData.date}
                        onChange={(e: any) =>
                          handleFormChange("date", e.target.value)
                        }
                        max={toISTDateInputValue()}
                        isInvalid={Boolean(formErrors.date)}
                      />
                      <Form.Control.Feedback type="invalid">
                        {formErrors.date}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={3}>
                    <Form.Group>
                      <Form.Label>ANO / Care Taker *</Form.Label>
                      <Form.Select
                        value={formData.anoId}
                        onChange={(e: any) =>
                          handleFormChange("anoId", e.target.value)
                        }
                        isInvalid={Boolean(formErrors.anoId)}
                      >
                        <option value="" disabled>
                          -- Select ANO --
                        </option>
                        {anoUsers.map((a) => (
                          <option key={a.uid} value={a.uid}>
                            {a.rank} {a.name}
                          </option>
                        ))}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">
                        {formErrors.anoId}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={3}>
                    <Form.Group>
                      <Form.Label>Time From *</Form.Label>
                      <Form.Control
                        type="time"
                        value={formData.timeFrom}
                        onChange={(e: any) =>
                          handleFormChange("timeFrom", e.target.value)
                        }
                        isInvalid={Boolean(formErrors.timeFrom)}
                      />
                      <Form.Control.Feedback type="invalid">
                        {formErrors.timeFrom}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={3}>
                    <Form.Group>
                      <Form.Label>Time To *</Form.Label>
                      <Form.Control
                        type="time"
                        value={formData.timeTo}
                        onChange={(e: any) =>
                          handleFormChange("timeTo", e.target.value)
                        }
                        isInvalid={Boolean(formErrors.timeTo)}
                      />
                      <Form.Control.Feedback type="invalid">
                        {formErrors.timeTo}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label>No. of Periods</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g. 4"
                        value={formData.periods}
                        onChange={(e: any) =>
                          handleFormChange("periods", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={4}>
                    <Form.Group>
                      <Form.Label>Refreshment Items</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="e.g. Tea, Snacks"
                        value={formData.refreshment}
                        onChange={(e: any) =>
                          handleFormChange("refreshment", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={12} md={4} className="d-flex align-items-end">
                    <Button
                      variant="success"
                      className="w-100"
                      onClick={fetchAttendanceData}
                      disabled={!formData.date || fetching}
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

        {dataFetched && (
          <>
            <Col lg={12}>
              {/* Step 2: Sessions Found */}
              <Card className="shadow-sm">
                <Card.Header className="bg-secondary text-white">
                  <i className="bi bi-clipboard-check me-2" />
                  Step 2 — Sessions Found
                </Card.Header>
                <Card.Body>
                  <p className="text-muted small mb-3">
                    Select which sessions to include. By default, all locked
                    official sessions for the date are selected.
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
                  <div className="d-flex flex-wrap gap-2 mb-3 mt-3">
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
                  <div className="text-muted small mb-4">
                    <strong>{sessionValidation.selectedCount}</strong> out of{" "}
                    {sessionsData.length} session(s) selected.
                  </div>

                  {/* Computed Stats */}
                  <div className="bg-light rounded p-3 mb-2">
                    <Row>
                      <Col xs={12} md={6}>
                        <div className="fw-bold mb-1">Cadet Str:</div>
                        <div>
                          Auth (Present):{" "}
                          <Badge bg="success" className="ms-1">
                            {computedStats.auth}
                          </Badge>
                        </div>
                        <div>
                          Enrolled (Total):{" "}
                          <Badge bg="secondary" className="ms-1">
                            {computedStats.enrolled}
                          </Badge>
                        </div>
                      </Col>
                      <Col xs={12} md={6}>
                        <div className="fw-bold mb-1">On Parade Breakdown:</div>
                        {computedStats.breakdownLines.length > 0 ? (
                          <ul className="mb-0 ps-3">
                            {computedStats.breakdownLines.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted">
                            No cadets marked present
                          </span>
                        )}
                      </Col>
                    </Row>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={12}>
              {/* Step 3: Subjects & Remarks */}
              <Card className="shadow-sm">
                <Card.Header className="bg-warning text-dark d-flex justify-content-between align-items-center">
                  <span>
                    <i className="bi bi-pencil-square me-2" />
                    Step 3 — Subjects & Remarks
                  </span>
                </Card.Header>
                <Card.Body>
                  <div className="mb-4">
                    <Form.Label className="fw-bold mb-3 d-flex align-items-center">
                      <i className="bi bi-book text-warning me-2 fs-5"></i>
                      Training Subjects
                    </Form.Label>

                    <Row>
                      <Col xs={12} md={6}>
                        <div className="subject-category-card p-3 rounded mb-3">
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="mb-0 fw-bold">Common Subjects</h6>
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => addSubject("common")}
                            >
                              <i className="bi bi-plus-lg"></i> Add
                            </Button>
                          </div>
                          {formData.commonSubjects.map((sub, index) => (
                            <div
                              key={index}
                              className="d-flex align-items-center mb-2"
                            >
                              <span className="me-2 text-muted fw-bold">
                                ({String.fromCharCode(97 + index)})
                              </span>
                              <Form.Control
                                type="text"
                                size="sm"
                                placeholder="e.g. Drill"
                                value={sub}
                                onChange={(e: any) =>
                                  updateSubject("common", index, e.target.value)
                                }
                              />
                              <Button
                                variant="link"
                                className="text-danger p-0 ms-2"
                                onClick={() => removeSubject("common", index)}
                              >
                                <i className="bi bi-trash"></i>
                              </Button>
                            </div>
                          ))}
                          {formData.commonSubjects.length === 0 && (
                            <div className="text-muted small text-center p-2 border border-dashed rounded">
                              No common subjects added.
                            </div>
                          )}
                        </div>
                      </Col>

                      <Col xs={12} md={6}>
                        <div
                          className="subject-category-card p-3 rounded mb-3"
                          style={{
                            borderLeftColor: "#0dcaf0",
                            backgroundColor: "#f5fcff",
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="mb-0 fw-bold">
                              Specialist Subjects
                            </h6>
                            <Button
                              variant="outline-info"
                              size="sm"
                              onClick={() => addSubject("specialist")}
                            >
                              <i className="bi bi-plus-lg"></i> Add
                            </Button>
                          </div>
                          {formData.specialistSubjects.map((sub, index) => (
                            <div
                              key={index}
                              className="d-flex align-items-center mb-2"
                            >
                              <span className="me-2 text-muted fw-bold">
                                ({String.fromCharCode(97 + index)})
                              </span>
                              <Form.Control
                                type="text"
                                size="sm"
                                placeholder="e.g. Map Reading"
                                value={sub}
                                onChange={(e: any) =>
                                  updateSubject(
                                    "specialist",
                                    index,
                                    e.target.value,
                                  )
                                }
                              />
                              <Button
                                variant="link"
                                className="text-danger p-0 ms-2"
                                onClick={() =>
                                  removeSubject("specialist", index)
                                }
                              >
                                <i className="bi bi-trash"></i>
                              </Button>
                            </div>
                          ))}
                          {formData.specialistSubjects.length === 0 && (
                            <div className="text-muted small text-center p-2 border border-dashed rounded">
                              No specialist subjects added.
                            </div>
                          )}
                        </div>
                      </Col>
                    </Row>
                  </div>

                  <Form.Group>
                    <Form.Label className="fw-bold">Remarks</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      placeholder="Enter remarks..."
                      value={formData.remarks}
                      onChange={(e: any) =>
                        handleFormChange("remarks", e.target.value)
                      }
                    />
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>

            {/* Step 4: Training Photos */}
            <Col lg={12}>
              <Card className="shadow-sm">
                <Card.Header className="bg-success text-white">
                  <i className="bi bi-camera me-2" />
                  Step 4 — Training Photos (Optional)
                </Card.Header>
                <Card.Body>
                  <p className="text-muted small mb-3">
                    Attach up to 3 training photos (PNG/JPG). Photos will
                    appear on a dedicated second page when provided. You can
                    drag and drop images here.
                  </p>

                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`p-3 border rounded ${isDragging ? "bg-light border-primary border-2" : ""}`}
                    style={{
                      borderStyle: isDragging ? "dashed" : "solid",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Row className="g-3 mb-3">
                      {[0, 1, 2].map((slotIndex) => (
                        <Col xs={12} md={4} key={slotIndex}>
                          {imagePreviewUrls[slotIndex] ? (
                            <div
                              className="position-relative border rounded overflow-hidden"
                              style={{ height: "140px" }}
                            >
                              <img
                                src={imagePreviewUrls[slotIndex]}
                                alt={`Photo ${slotIndex + 1}`}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                              <Button
                                variant="danger"
                                size="sm"
                                className="position-absolute top-0 end-0 m-1"
                                onClick={() => handleImageRemove(slotIndex)}
                                style={{
                                  borderRadius: "50%",
                                  width: "28px",
                                  height: "28px",
                                  padding: 0,
                                }}
                              >
                                <i className="bi bi-x" />
                              </Button>
                              <div
                                className="position-absolute bottom-0 start-0 w-100 text-center py-1"
                                style={{
                                  background: "rgba(0,0,0,0.5)",
                                  color: "#fff",
                                  fontSize: "11px",
                                }}
                              >
                                Photo {slotIndex + 1}
                              </div>
                            </div>
                          ) : (
                            <label
                              className="d-flex flex-column align-items-center justify-content-center border border-dashed rounded text-muted"
                              style={{
                                height: "140px",
                                cursor: "pointer",
                                borderStyle: "dashed",
                              }}
                            >
                              <i className="bi bi-plus-lg fs-3" />
                              <small>Photo {slotIndex + 1}</small>
                              <input
                                type="file"
                                accept="image/png, image/jpeg"
                                multiple
                                className="d-none"
                                onChange={handleImageAdd}
                              />
                            </label>
                          )}
                        </Col>
                      ))}
                    </Row>
                    <div className="text-muted small">
                      <strong>{attachedImages.length}</strong> / 3 photos
                      attached (optional)
                      {attachedImages.length === 3 && (
                        <span className="text-success ms-2">
                          <i className="bi bi-check-circle-fill me-1" />
                          All photos added
                        </span>
                      )}
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={12}>
              {/* Generate Button */}
              <div className="d-flex justify-content-end mb-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleGenerate}
                  disabled={
                    !sessionValidation.isValid || selectedSessionIds.size === 0
                  }
                >
                  <i className="bi bi-file-earmark-text me-2" /> Preview
                  Training Diary
                </Button>
              </div>
            </Col>
          </>
        )}
      </Row>

      {/* Preview Modal */}
      <Modal
        show={showPreview}
        onHide={() => setShowPreview(false)}
        size="xl"
        fullscreen="lg-down"
        className="td-preview-modal"
      >
        <Modal.Header closeButton className="td-no-print">
          <Modal.Title>Training Diary Preview</Modal.Title>
        </Modal.Header>
        <Modal.Body className="td-preview-body bg-light p-4">
          <div className="td-print-area">
            <div
              className="document-preview-card mx-auto bg-white p-5 td-page"
              style={{ maxWidth: "210mm", minHeight: "297mm" }}
            >
              <TrainingDiaryDocument
                formData={formData}
                computedStats={computedStats}
                anoRank={selectedAno?.rank}
                anoName={selectedAno?.name}
              />
            </div>
            {imagePreviewUrls.length > 0 && (
              <div
                className="document-preview-card mx-auto bg-white td-page td-page-photos"
                style={{
                  maxWidth: "210mm",
                  minHeight: "297mm",
                  marginTop: "24px",
                }}
              >
                {imagePreviewUrls.map((url, i) => (
                  <div key={i} className="td-photo-envelope">
                    <img src={url} alt={`Training photo ${i + 1}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer className="td-no-print">
          <Button variant="secondary" onClick={() => setShowPreview(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            <i className="bi bi-printer me-2"></i> Print Document
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

// ============ Print Document Component ============

const TrainingDiaryDocument: React.FC<{
  formData: TrainingDiaryFormData;
  computedStats: any;
  anoRank?: string;
  anoName?: string;
}> = ({ formData, computedStats, anoRank, anoName }) => {
  const currentYear = formData.date
    ? new Date(formData.date).getFullYear()
    : new Date().getFullYear();
  const formattedDate = formData.date ? formatISTDate(formData.date) : "";
  const anoFullName = anoRank ? `${anoRank} ${anoName}` : anoName || "";

  return (
    <div>
      <div className="td-header">
        <h4>4 (TN) ENGR COY NCC, MADURAI</h4>
        <h5>
          TRAINING DIARY FOR THE YEAR <strong>{currentYear}</strong>
        </h5>
      </div>

      <div
        className="td-info-row"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <div style={{ display: "flex" }}>
          <span style={{ whiteSpace: "nowrap", marginRight: "8px" }}>
            Name of the Institution :
          </span>
          <span>
            <u>
              <strong>
                {formData.institution || "Thiagarajar College of Engineering"}
              </strong>
            </u>
          </span>
        </div>
        <div style={{ display: "flex" }}>
          <span style={{ whiteSpace: "nowrap", marginRight: "8px" }}>
            Date:
          </span>
          <span>
            <u>
              <strong>{formattedDate}</strong>
            </u>
          </span>
        </div>
      </div>

      <div
        className="td-info-row"
        style={{ display: "flex", marginBottom: "8px" }}
      >
        <span style={{ whiteSpace: "nowrap", marginRight: "8px" }}>
          Name of the ANO / Care Taker:
        </span>
        <span>
          <u>
            <strong>{anoFullName}</strong>
          </u>
        </span>
      </div>

      <div
        className="td-info-row"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <div style={{ display: "flex" }}>
          <span style={{ whiteSpace: "nowrap", marginRight: "8px" }}>
            Parade : From
          </span>
          <span>
            <u>
              <strong>{formData.timeFrom}</strong>
            </u>
          </span>
          <span style={{ whiteSpace: "nowrap", margin: "0 8px" }}>To</span>
          <span>
            <u>
              <strong>{formData.timeTo}</strong>
            </u>
          </span>
        </div>
        <div style={{ display: "flex" }}>
          <span style={{ whiteSpace: "nowrap", marginRight: "8px" }}>
            No. of Periods:
          </span>
          <span>
            <u>
              <strong>{formData.periods}</strong>
            </u>
          </span>
        </div>
      </div>

      <div
        className="td-info-row"
        style={{ display: "flex", marginBottom: "8px" }}
      >
        <span style={{ whiteSpace: "nowrap", marginRight: "8px" }}>
          Cadet Str : Auth
        </span>
        <span>
          <u>
            <strong>{computedStats.auth}</strong>
          </u>
        </span>
        <span style={{ whiteSpace: "nowrap", margin: "0 8px 0 16px" }}>
          Enrolled
        </span>
        <span>
          <u>
            <strong>{computedStats.enrolled}</strong>
          </u>
        </span>
      </div>

      <table className="td-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Cadets on parade</th>
            <th>Subjects covered</th>
            <th>Refreshment served</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={2} className="col-sno">
              1.
            </td>
            <td rowSpan={2}>
              <div>SD/SW Cadets</div>
              {computedStats.breakdownLines.length > 0 && (
                <div style={{ marginTop: "10px", fontSize: "11pt" }}>
                  {computedStats.breakdownLines.map(
                    (line: string, i: number) => (
                      <div key={i}>{line}</div>
                    ),
                  )}
                </div>
              )}
            </td>
            <td style={{ borderBottom: "1px solid black" }}>
              <div className="td-subjects-list">
                <div className="td-subject-header">Common Subjects</div>
                {formData.commonSubjects
                  .filter((s) => s.trim())
                  .map((sub, idx) => (
                    <div key={idx} className="td-subject-item">
                      <div className="td-subject-letter">
                        ({String.fromCharCode(97 + idx)})
                      </div>
                      <div>{sub}</div>
                    </div>
                  ))}
                {formData.commonSubjects.filter((s) => s.trim()).length ===
                  0 && (
                  <div className="td-subject-item">
                    <div className="td-subject-letter">(a)</div>
                    <div></div>
                  </div>
                )}
              </div>
            </td>
            <td rowSpan={2}>{formData.refreshment}</td>
            <td rowSpan={2}>{formData.remarks}</td>
          </tr>
          <tr>
            <td>
              <div className="td-subjects-list last">
                <div className="td-subject-header">Specialist Subjects</div>
                {formData.specialistSubjects
                  .filter((s) => s.trim())
                  .map((sub, idx) => (
                    <div key={idx} className="td-subject-item">
                      <div className="td-subject-letter">
                        ({String.fromCharCode(97 + idx)})
                      </div>
                      <div>{sub}</div>
                    </div>
                  ))}
                {formData.specialistSubjects.filter((s) => s.trim()).length ===
                  0 && (
                  <div className="td-subject-item">
                    <div className="td-subject-letter">(a)</div>
                    <div></div>
                  </div>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="td-footer-section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>
            Name &amp; Signature of PI Staff&nbsp;&nbsp;:
          </span>
          <span>____________________________________________________</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>
            Name &amp; Signature of
            ANO&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:
          </span>
          <span>____________________________________________________</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-end" }}>
            <span style={{ whiteSpace: "nowrap", marginRight: "8px" }}>
              Name &amp; Signature of Two Sr Cdts :
            </span>
            <span style={{ whiteSpace: "nowrap" }}>(1)&nbsp;</span>
            <span
              style={{
                flexGrow: 1,
                borderBottom: "1px solid black",
                margin: "0 8px 4px 0",
              }}
            ></span>
          </div>
          <span style={{ whiteSpace: "nowrap" }}>
            (Mob. No. __________________)
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "8px",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexGrow: 1, alignItems: "flex-end" }}>
            <span
              style={{
                whiteSpace: "nowrap",
                marginRight: "8px",
                visibility: "hidden",
              }}
            >
              Name &amp; Signature of Two Sr Cdts :
            </span>
            <span style={{ whiteSpace: "nowrap" }}>(2)&nbsp;</span>
            <span
              style={{
                flexGrow: 1,
                borderBottom: "1px solid black",
                margin: "0 8px 4px 0",
              }}
            ></span>
          </div>
          <span style={{ whiteSpace: "nowrap" }}>
            (Mob. No. __________________)
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "16px",
            marginBottom: "8px",
          }}
        >
          <span style={{ whiteSpace: "nowrap" }}>
            Visit of any VIP/Dignitary&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:
          </span>
          <span>____________________________________________________</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "8px",
          }}
        >
          <span>____________________________________________________</span>
        </div>

        <div className="td-signature-blocks">
          <div className="td-signature-block">Signature of Sr JCO</div>
          <div className="td-signature-block">Signature of OC Unit</div>
        </div>

        <div className="td-note">
          <u>*Note</u> : This register will be maintained separately for each
          institute of the unit and will be taken by the PI Staff during the
          training. This register will be inspected by the Group Commander once
          in a quarter.
        </div>
      </div>
    </div>
  );
};

export default TrainingDiaryReport;
