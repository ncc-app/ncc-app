import { Table, Badge, Form, Card } from "react-bootstrap";
import { useState, useMemo, useEffect, type ChangeEvent } from "react";
import TablePaginationFooter from "@/components/common/TablePaginationFooter";
import type {
  AttendanceSession,
  AttendanceMark,
} from "@/features/attendance/attendance.types";
import {
  ATTENDANCE_STATUS_COLORS,
  ATTENDANCE_STATUS_LABELS,
} from "@/features/attendance/attendance.types";

interface SessionWithMark {
  session: AttendanceSession & { id: string };
  mark: AttendanceMark | null;
}

interface SessionHistoryProps {
  history: SessionWithMark[];
}

export function SessionHistory({ history }: SessionHistoryProps) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesStatus = !statusFilter || item.mark?.status === statusFilter;
      return matchesStatus;
    });
  }, [history, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / rowsPerPage));
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredHistory.slice(start, start + rowsPerPage);
  }, [currentPage, filteredHistory, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const formatSessionDate = (date: string) => {
    const [year, month, day] = date.split("-");
    return year && month && day ? `${day}-${month}-${year}` : date;
  };

  return (
    <Card className="border-0 shadow-sm">
      <Card.Header className="bg-white d-flex flex-wrap gap-2 align-items-center">
        <span className="fw-semibold">Session History</span>
        <div className="ms-auto d-flex gap-2">
          <Form.Select
            size="sm"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setStatusFilter(e.target.value)
            }
          >
            <option value="">All Status</option>
            <option value="P">Present</option>
            <option value="A">Absent</option>
          </Form.Select>
        </div>
      </Card.Header>
      <Card.Body className="p-0">
        {filteredHistory.length === 0 ? (
          <div className="text-center text-muted py-5">
            No attendance records found
          </div>
        ) : (
          <Table hover responsive className="mb-0">
            <thead className="bg-light">
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistory.map((item) => (
                <tr key={item.session.id}>
                  <td>{formatSessionDate(item.session.date)}</td>
                  <td>{item.session.title}</td>
                  <td>
                    <Badge
                      bg={
                        item.mark
                          ? ATTENDANCE_STATUS_COLORS[item.mark.status]
                          : "secondary"
                      }
                    >
                      {item.mark
                        ? ATTENDANCE_STATUS_LABELS[item.mark.status]
                        : "N/A"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>
      <TablePaginationFooter
        totalItems={filteredHistory.length}
        currentPage={currentPage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={setRowsPerPage}
        onFirstPage={() => setCurrentPage(1)}
        onPreviousPage={() => setCurrentPage((page) => Math.max(1, page - 1))}
        onNextPage={() =>
          setCurrentPage((page) => Math.min(totalPages, page + 1))
        }
        onLastPage={() => setCurrentPage(totalPages)}
      />
    </Card>
  );
}
