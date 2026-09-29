import { useState, useEffect, useCallback, ChangeEvent } from "react";
import { Card, Button, Alert, Spinner, Badge, Form } from "react-bootstrap";

import { useAuth } from "@/features/auth/AuthContext";
import { QuickSelectGrid } from "./QuickSelectGrid";
import {
  getSession,
  getCadetsByDivision,
  listMarks,
  bulkSetMarks,
  lockSession,
  updateSessionStatus,
  updateSessionParadeFlags,
  updateSessionTitle,
} from "@/features/attendance/service";
import {
  ATTENDANCE_SESSION_TITLE_OPTIONS,
  type AttendanceSessionTitle,
  type Division,
  type NccYear,
} from "@/shared/config/constants";
import type {
  AttendanceSession,
  AttendanceStatus,
} from "@/features/attendance/attendance.types";
import type { Cadet } from "@/shared/types";
import toast from "react-hot-toast";
import { formatISTDate } from "@/shared/utils/dateTime";

interface BulkMarkerProps {
  sessionId: string;
  onClose?: () => void;
}

export function BulkMarker({ sessionId, onClose }: BulkMarkerProps) {
  const { currentUser, userProfile } = useAuth();
  const [session, setSession] = useState<
    (AttendanceSession & { id: string }) | null
  >(null);
  const [cadets, setCadets] = useState<(Cadet & { id: string })[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [titleType, setTitleType] =
    useState<AttendanceSessionTitle>("Other");

  // Load session and cadets
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const sess = await getSession(sessionId);
        if (!sess) {
          toast.error("Session not found");
          onClose?.();
          return;
        }
        setSession(sess);
        setTitleType(
          sess.title === "Parade" || sess.title === "Theory"
            ? sess.title
            : "Other",
        );

        // Load cadets for this division/year
        const cadetList = await getCadetsByDivision(
          sess.divisionId as Division,
          sess.nccYear as NccYear,
        );
        const sortedCadets = [...cadetList].sort((a, b) =>
          (a.regimentalNumber || "").localeCompare(
            b.regimentalNumber || "",
            undefined,
            { numeric: true, sensitivity: "base" },
          ),
        );
        setCadets(sortedCadets);

        // Default all cadets to absent for quick draft/lock workflows.
        const marksMap: Record<string, AttendanceStatus> = {};
        sortedCadets.forEach((c) => {
          marksMap[c.id] = "A";
        });

        // Load existing marks
        const existingMarks = await listMarks(sessionId);
        existingMarks.forEach((m) => {
          marksMap[m.cadetId] = m.status;
        });
        setMarks(marksMap);
      } catch (err) {
        console.error("Error loading session:", err);
        toast.error("Failed to load session");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  // Handle individual mark change
  const handleMarkChange = useCallback(
    (cadetId: string, status: AttendanceStatus) => {
      setMarks((prev) => ({ ...prev, [cadetId]: status }));
      setHasChanges(true);
    },
    [],
  );

  // Handle bulk mark (all present/absent)
  const handleBulkMark = useCallback(
    (status: AttendanceStatus) => {
      const newMarks: Record<string, AttendanceStatus> = {};
      cadets.forEach((c) => {
        newMarks[c.id] = status;
      });
      setMarks(newMarks);
      setHasChanges(true);
    },
    [cadets],
  );

  // Save marks
  const handleSave = async (lock = false) => {
    const markerUid = currentUser?.uid || userProfile?.uid;
    if (!markerUid) {
      toast.error(
        "Unable to identify current user. Please re-login and try again.",
      );
      return;
    }

    setSaving(true);
    try {
      if (!session?.title.trim()) {
        toast.error("Please enter a session title");
        return;
      }

      await updateSessionTitle(sessionId, session.title, session.category);

      // Prepare bulk payload
      const marksList = Object.entries(marks).map(([cadetId, status]) => ({
        cadetId,
        status,
      }));

      await bulkSetMarks({
        sessionId,
        marks: marksList,
        markedBy: markerUid,
      });

      if (session) {
        await updateSessionParadeFlags(sessionId, {
          paradeCount: session.paradeCount || 1,
          isOfficialParade: !!session.isOfficialParade,
        });
      }

      if (lock) {
        await lockSession(sessionId, markerUid);
        toast.success("Attendance saved and session locked");
        onClose?.();
      } else {
        // Just open the session if it was draft
        if (session?.status === "draft") {
          await updateSessionStatus(sessionId, "open");
        }
        toast.success("Attendance saved");
      }

      setHasChanges(false);
    } catch (err) {
      console.error("Error saving marks:", err);
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner as="span" animation="border" size="sm" />
        <p className="mt-2">Loading session...</p>
      </div>
    );
  }

  if (!session) {
    return <Alert variant="danger">Session not found</Alert>;
  }

  const isLocked = session.status === "locked";

  return (
    <Card>
      <Card.Header className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
        <div>
          <h5 className="mb-0">
            {session.title}
            <span className="ms-2 fs-6 fw-normal text-muted">
              {formatISTDate(session.date, {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })}{" "}
              | {session.divisionId} | {session.nccYear}
            </span>
            {(session.paradeCount || 1) >= 2 && (
              <Badge bg="warning" text="dark" className="ms-2 fw-normal">
                Double
              </Badge>
            )}
            {session.isOfficialParade && (
              <Badge bg="info" className="ms-2 fw-normal">
                Official
              </Badge>
            )}
          </h5>
        </div>
        <div className="d-flex gap-2">
          {onClose && (
            <Button variant="outline-secondary" size="sm" onClick={onClose}>
              <i className="bi bi-x-lg"></i> Close
            </Button>
          )}
        </div>
      </Card.Header>
      <Card.Body>
        {isLocked && (
          <Alert variant="warning" className="mb-3">
            <i className="bi bi-lock-fill me-2"></i>
            This session is locked and cannot be edited.
          </Alert>
        )}

        {!isLocked && (
          <div className="mb-3">
            <Form.Group className="mb-3" style={{ maxWidth: 420 }}>
              <Form.Label>Session Title</Form.Label>
              <Form.Select
                value={titleType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const value = e.target.value as AttendanceSessionTitle;
                  setTitleType(value);
                  setSession((prev) => {
                    if (!prev) return prev;
                    const title =
                      value === "Other" &&
                      (prev.title === "Parade" || prev.title === "Theory")
                        ? ""
                        : value;
                    const category =
                      value === "Theory" ? "Theory Class" : value;
                    return { ...prev, title, category };
                  });
                  setHasChanges(true);
                }}
                disabled={saving}
              >
                {ATTENDANCE_SESSION_TITLE_OPTIONS.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </Form.Select>
              {titleType === "Other" && (
                <Form.Control
                  className="mt-2"
                  value={session.title}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setSession((prev) =>
                      prev ? { ...prev, title: e.target.value, category: "Other" } : prev,
                    );
                    setHasChanges(true);
                  }}
                  placeholder="Enter a custom title"
                  disabled={saving}
                />
              )}
            </Form.Group>

            <div className="d-flex gap-4">
            <Form.Check
              type="checkbox"
              id={`marker-double-parade-${sessionId}`}
              label="Saturday Parade (Double)"
              checked={(session.paradeCount || 1) >= 2}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const newCount = e.target.checked ? 2 : 1;
                setSession((prev) =>
                  prev ? { ...prev, paradeCount: newCount } : prev,
                );
                setHasChanges(true);
              }}
            />
            <Form.Check
              type="checkbox"
              id={`marker-official-parade-${sessionId}`}
              label="Official Parade"
              checked={session.isOfficialParade === true}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const newVal = e.target.checked;
                setSession((prev) =>
                  prev ? { ...prev, isOfficialParade: newVal } : prev,
                );
                setHasChanges(true);
              }}
            />
            </div>
          </div>
        )}

        <QuickSelectGrid
          cadets={cadets}
          marks={marks}
          onMarkChange={handleMarkChange}
          onBulkMark={handleBulkMark}
          disabled={isLocked || saving}
        />
      </Card.Body>
      {!isLocked && (
        <Card.Footer className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
          <div>
            {hasChanges && (
              <span className="text-warning">
                <i className="bi bi-exclamation-circle me-1"></i>
                Unsaved changes
              </span>
            )}
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="outline-primary"
              onClick={() => handleSave(false)}
              disabled={saving || !hasChanges}
            >
              {saving ? "Saving..." : "Save Draft"}
            </Button>
            <Button
              variant="success"
              onClick={() => handleSave(true)}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save & Lock"}
            </Button>
          </div>
        </Card.Footer>
      )}
    </Card>
  );
}
