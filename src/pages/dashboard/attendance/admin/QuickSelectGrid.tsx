import { useState, useMemo, useCallback, type ChangeEvent } from "react";
import { Form, InputGroup, Badge, Button, ButtonGroup } from "react-bootstrap";
import type { Cadet } from "@/shared/types";
import type { AttendanceStatus } from "@/features/attendance/attendance.types";
import {
  ATTENDANCE_STATUS_COLORS,
  ATTENDANCE_STATUS_LABELS,
} from "@/features/attendance/attendance.types";
import "./QuickSelectGrid.css";

interface QuickSelectGridProps {
  cadets: (Cadet & { id: string })[];
  marks: Record<string, AttendanceStatus>; // cadetId -> status
  onMarkChange: (cadetId: string, status: AttendanceStatus) => void;
  onBulkMark: (status: AttendanceStatus) => void;
  disabled?: boolean;
}

const STATUS_CYCLE: AttendanceStatus[] = ["P", "A"];

export function QuickSelectGrid({
  cadets,
  marks,
  onMarkChange,
  onBulkMark,
  disabled = false,
}: QuickSelectGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Filter cadets
  const filteredCadets = useMemo(() => {
    return cadets.filter((cadet) => {
      const matchesSearch =
        !searchTerm ||
        cadet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cadet.regimentalNumber
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());
      const currentStatus = marks[cadet.id];
      const matchesStatus = !statusFilter || currentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [cadets, searchTerm, statusFilter, marks]);

  // Stats
  const stats = useMemo(() => {
    const s = { total: cadets.length, P: 0, A: 0 };
    cadets.forEach((c) => {
      const status = marks[c.id];
      if (status) {
        s[status]++;
      }
    });
    return s;
  }, [cadets, marks]);

  // Cycle through statuses on click
  const handleCadetClick = useCallback(
    (cadetId: string) => {
      if (disabled) return;
      const currentStatus = marks[cadetId];
      const currentIndex = currentStatus
        ? STATUS_CYCLE.indexOf(currentStatus)
        : -1;
      const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
      onMarkChange(cadetId, STATUS_CYCLE[nextIndex]);
    },
    [marks, onMarkChange, disabled],
  );

  // Handle keyboard for focused cadet
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, cadetId: string) => {
      if (disabled) return;
      const key = e.key.toUpperCase();
      if (key === "P" || key === "A") {
        e.preventDefault();
        onMarkChange(cadetId, key as AttendanceStatus);
      }
    },
    [onMarkChange, disabled],
  );

  return (
    <div className="quick-select-grid">
      {/* Toolbar */}
      <div className="qsg-toolbar mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <InputGroup style={{ maxWidth: 250 }}>
            <InputGroup.Text>
              <i className="bi bi-search"></i>
            </InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="Search name/reg..."
              value={searchTerm}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setSearchTerm(e.target.value)
              }
            />
          </InputGroup>

          <Form.Select
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setStatusFilter(e.target.value)
            }
          >
            <option value="">All Status</option>
            {STATUS_CYCLE.map((s) => (
              <option key={s} value={s}>
                {ATTENDANCE_STATUS_LABELS[s]}
              </option>
            ))}
          </Form.Select>

          <div className="ms-auto">
            <ButtonGroup size="sm">
              <Button
                variant="outline-success"
                onClick={() => onBulkMark("P")}
                disabled={disabled}
              >
                All Present
              </Button>
              <Button
                variant="outline-danger"
                onClick={() => onBulkMark("A")}
                disabled={disabled}
              >
                All Absent
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="qsg-stats-bar mb-3 p-2 bg-light rounded d-flex flex-wrap gap-3">
        <Badge bg="secondary">Total: {stats.total}</Badge>
        <Badge bg="success">Present: {stats.P}</Badge>
        <Badge bg="danger">Absent: {stats.A}</Badge>
      </div>

      {/* Grid */}
      <div className="qsg-grid">
        {filteredCadets.map((cadet) => {
          const status = marks[cadet.id];
          const colorClass = status
            ? ATTENDANCE_STATUS_COLORS[status]
            : "light";
          return (
            <div
              key={cadet.id}
              className={`qsg-card border rounded p-2 bg-${colorClass} ${
                status ? "text-white" : ""
              } ${disabled ? "disabled" : ""}`}
              onClick={() => handleCadetClick(cadet.id)}
              onKeyDown={(e) => handleKeyDown(e, cadet.id)}
              tabIndex={0}
              role="button"
              aria-label={`${cadet.name}: ${status ? ATTENDANCE_STATUS_LABELS[status] : "Unmarked"}`}
            >
              <div className="qsg-rank small text-uppercase opacity-75">
                {cadet.rank || "CDT"}
              </div>
              <div className="qsg-name fw-semibold">
                {cadet.name}
              </div>
              <div className="qsg-status mt-1">
                {status ? (
                  <Badge
                    bg={colorClass === "warning" ? "dark" : "light"}
                    text={colorClass === "warning" ? "white" : "dark"}
                  >
                    {status}
                  </Badge>
                ) : (
                  <Badge bg="secondary">--</Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredCadets.length === 0 && (
        <div className="text-center text-muted py-4">
          No cadets match the current filters
        </div>
      )}
    </div>
  );
}
