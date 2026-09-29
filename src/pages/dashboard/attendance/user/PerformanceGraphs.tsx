import { useMemo } from "react";
import { Card, Row, Col } from "react-bootstrap";
import { AttendanceBarChart } from "@/features/attendance/charts";
import type { CadetAttendanceStats } from "@/features/attendance/attendance.types";

interface PerformanceGraphsProps {
  stats: CadetAttendanceStats | null;
}

export function PerformanceGraphs({ stats }: PerformanceGraphsProps) {
  const categoryBreakdown = useMemo(
    () =>
      Object.entries(stats?.categoryBreakdown || {}).map(([label, data]) => ({
        label,
        present: data.present,
        absent: data.absent,
      })),
    [stats],
  );

  if (!stats) {
    return (
      <Card className="border-0 shadow-sm">
        <Card.Body className="text-center text-muted py-5">
          No attendance data available for charts
        </Card.Body>
      </Card>
    );
  }

  return (
    <Row className="g-3">
      <Col lg={12}>
        <Card className="border-0 shadow-sm">
          <Card.Body>
            {categoryBreakdown.length === 0 ? (
              <div className="text-center text-muted py-4">
                No category attendance data available
              </div>
            ) : (
              <AttendanceBarChart
                data={categoryBreakdown}
                title="Attendance by Category"
                height={280}
                stacked
              />
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
