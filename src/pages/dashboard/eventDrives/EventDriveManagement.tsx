import type { ChangeEvent } from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Badge,
  Button,
  Col,
  Container,
  Form,
  Row,
  Spinner,
  Tab,
  Table,
  Tabs,
} from "react-bootstrap";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/features/auth/AuthContext";
import { isCadetUser } from "@/shared/utils/userType";
import {
  createDrive,
  updateDrive,
  listenDrives,
  autoCloseExpiredDrives,
} from "@/features/eventDrives/eventDriveService";
import type { CreateDriveData } from "@/features/eventDrives/eventDriveService";
import type { EventDrive } from "@/shared/types";
import {
  DRIVE_TYPE_LABELS,
  DRIVE_TYPES,
  NCC_YEARS,
} from "@/shared/config/constants";
import type { DriveType } from "@/shared/config/constants";
import { formatISTDate, formatISTDateTime } from "@/shared/utils/dateTime";
import { TablePaginationFooter } from "@/components";
import CreateEditDriveModal from "./CreateEditDriveModal";
import EventDrivesView from "./EventDrivesView";

export default function EventDriveManagement() {
  const { currentUser, userProfile } = useAuth();
  const [drives, setDrives] = useState<(EventDrive & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("manage");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingDrive, setEditingDrive] = useState<
    (EventDrive & { id: string }) | undefined
  >(undefined);

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [typeFilter, setTypeFilter] = useState<DriveType | "all">("all");
  const [divisionFilter, setDivisionFilter] = useState<"all" | "SD" | "SW">("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const role = userProfile?.role;
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "superadmin";
  const isCadet = isCadetUser(userProfile as { userType?: string } | null);

  // ANO users only see Manage tab; cadets (admin/superadmin) see both
  const canManage = isAdmin || isSuperAdmin;
  const canPoll = isCadet && (isAdmin || isSuperAdmin);

  // Auto-close expired drives on mount
  useEffect(() => {
    autoCloseExpiredDrives().catch((err) => {
      console.error("Failed to auto-close expired drives:", err);
    });
  }, []);

  // Load drives
  useEffect(() => {
    const unsub = listenDrives((items) => {
      setDrives(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, typeFilter, divisionFilter, yearFilter, searchTerm, rowsPerPage]);

  const handleSaveDrive = useCallback(
    async (data: CreateDriveData) => {
      try {
        if (editingDrive) {
          await updateDrive(editingDrive.id, data as any);
          toast.success("Event drive updated!");
        } else {
          await createDrive(data);
          toast.success("Event drive created!");
        }
        setShowCreateModal(false);
        setEditingDrive(undefined);
      } catch (err: any) {
        toast.error(err.message || "Failed to save drive");
      }
    },
    [editingDrive]
  );

  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false);
    setEditingDrive(undefined);
  }, []);

  const getDriveTypeLabel = (drive: EventDrive) => {
    if (drive.driveType === "other" && drive.customDriveType) {
      return drive.customDriveType;
    }
    return DRIVE_TYPE_LABELS[drive.driveType as DriveType] || drive.driveType;
  };

  const isDeadlinePassed = (deadline: string) => {
    return new Date(deadline) < new Date();
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setDivisionFilter("all");
    setYearFilter("all");
    setSearchTerm("");
  };

  // Filter logic
  const filteredDrives = drives.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (typeFilter !== "all" && d.driveType !== typeFilter) return false;
    if (divisionFilter !== "all" && d.targetDivision !== divisionFilter) return false;
    if (yearFilter !== "all" && d.targetNccYear !== yearFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!d.title.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filteredDrives.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const paginatedDrives = filteredDrives.slice(startIndex, startIndex + rowsPerPage);

  if (!canManage) {
    return (
      <Container className="py-4">
        <h2>Access Denied</h2>
        <p>You do not have permission to access this page.</p>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <h2 className="mb-1">Event Manager</h2>
      <p className="text-muted mb-3">Manage event drives and poll responses.</p>

      <Tabs
        activeKey={activeTab}
        onSelect={(k: string | null) => setActiveTab(k || "manage")}
        className="mb-3"
      >
        <Tab eventKey="manage" title="Manage Drives">
          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
            </div>
          ) : (
            <>
              <Row className="mb-3 g-3 align-items-center">
                <Col xs={12} md="auto">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setEditingDrive(undefined);
                      setShowCreateModal(true);
                    }}
                  >
                    <i className="bi bi-plus-circle me-2"></i>
                    Create New Drive
                  </Button>
                </Col>
                <Col xs={12} md>
                  <Form.Control
                    type="text"
                    placeholder="Search drives..."
                    value={searchTerm}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                  />
                </Col>
                <Col xs={6} md="auto">
                  <Form.Select
                    value={typeFilter}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setTypeFilter(e.target.value as DriveType | "all")
                    }
                  >
                    <option value="all">All Types</option>
                    {Object.values(DRIVE_TYPES).map((type) => (
                      <option key={type} value={type}>
                        {DRIVE_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col xs={6} md="auto">
                  <Form.Select
                    value={statusFilter}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setStatusFilter(e.target.value as "all" | "open" | "closed")
                    }
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </Form.Select>
                </Col>
                <Col xs={6} md="auto">
                  <Form.Select
                    value={divisionFilter}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setDivisionFilter(e.target.value as "all" | "SD" | "SW")
                    }
                  >
                    <option value="all">All Divisions</option>
                    <option value="SD">SD</option>
                    <option value="SW">SW</option>
                  </Form.Select>
                </Col>
                <Col xs={6} md="auto">
                  <Form.Select
                    value={yearFilter}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setYearFilter(e.target.value)
                    }
                  >
                    <option value="all">All Years</option>
                    {NCC_YEARS.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </Form.Select>
                </Col>
                <Col xs={12} md="auto">
                  <Button variant="outline-secondary" onClick={clearFilters} className="w-100">
                    Clear Filters
                  </Button>
                </Col>
              </Row>

              {filteredDrives.length === 0 ? (
                <div className="text-center py-4 border rounded bg-light">
                  <p className="text-muted mb-0">No event drives found matching your criteria.</p>
                </div>
              ) : (
                <>
                  <Table responsive hover className="align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>S.No</th>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Target</th>
                        <th>Date</th>
                        <th>Deadline</th>
                        <th>Responses</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDrives.map((drive, index) => (
                        <tr key={drive.id}>
                          <td>{startIndex + index + 1}</td>
                          <td>
                            <Link to={`/admin/event-drives/${drive.id}`} className="text-decoration-none fw-bold">
                              {drive.title}
                            </Link>
                          </td>
                          <td>{getDriveTypeLabel(drive)}</td>
                          <td>
                            <small>
                              {drive.targetDivision} — {drive.targetNccYear}
                            </small>
                          </td>
                          <td>{formatISTDate(drive.date)}</td>
                          <td>
                            <small className={isDeadlinePassed(drive.deadline) ? "text-danger" : ""}>
                              {formatISTDateTime(drive.deadline)}
                            </small>
                          </td>
                          <td>
                            <Badge bg="success" className="me-1" title="Opted In">
                              {drive.stats?.optedIn || 0}
                            </Badge>
                            <Badge bg="danger" className="me-1" title="Opted Out">
                              {drive.stats?.optedOut || 0}
                            </Badge>
                            <Badge bg="warning" text="dark" title="No Response">
                              {drive.stats?.noResponse || 0}
                            </Badge>
                          </td>
                          <td>
                            <Badge bg={drive.status === "open" ? "success" : "secondary"}>
                              {drive.status === "open" ? "Open" : "Closed"}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              as={Link as any}
                              to={`/admin/event-drives/${drive.id}`}
                              variant="outline-primary"
                              size="sm"
                              title="View Drive Details"
                            >
                              <i className="bi bi-eye"></i>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <TablePaginationFooter
                    totalItems={filteredDrives.length}
                    currentPage={safePage}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={setRowsPerPage}
                    onFirstPage={() => setCurrentPage(1)}
                    onPreviousPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    onLastPage={() => setCurrentPage(totalPages)}
                  />
                </>
              )}
            </>
          )}
        </Tab>

        {canPoll && (
          <Tab eventKey="poll" title="Poll in Drive">
            <EventDrivesView />
          </Tab>
        )}
      </Tabs>

      <CreateEditDriveModal
        show={showCreateModal}
        onHide={handleCloseCreateModal}
        onSave={handleSaveDrive}
        editDrive={editingDrive}
        createdBy={currentUser?.uid || ""}
      />
    </Container>
  );
}
