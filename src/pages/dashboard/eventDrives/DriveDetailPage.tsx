import { Fragment, useEffect, useState, type ChangeEvent } from 'react';
import { Container, Row, Col, Card, Table, Badge, Button, Form, Spinner, Modal, Collapse } from 'react-bootstrap';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getDriveById, updateDrive, closeDrive, reopenDrive, deleteDrive, type CreateDriveData } from '@/features/eventDrives/eventDriveService';
import { getEligibleCadetsWithResponses, type CadetWithResponse } from '@/features/eventDrives/responseService';
import { exportResponsesAsExcel, exportResponsesAsPdf } from '@/features/eventDrives/exportService';
import { DRIVE_TYPE_LABELS, DRIVE_RESPONSE_LABELS, type DriveType, type DriveResponseType } from '@/shared/config/constants';
import type { EventDrive } from '@/shared/types';
import { formatISTDate, formatISTDateTime, toISTDateTimeInputValue } from '@/shared/utils/dateTime';
import { TablePaginationFooter } from '@/components';
import CreateEditDriveModal from './CreateEditDriveModal';

export default function DriveDetailPage() {
    const { driveId } = useParams<{ driveId: string }>();
    const navigate = useNavigate();

    const [drive, setDrive] = useState<EventDrive | null>(null);
    const [cadets, setCadets] = useState<CadetWithResponse[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // Filters and pagination
    const [filterResponse, setFilterResponse] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [rowsPerPage, setRowsPerPage] = useState<number>(10);

    // Modals state
    const [showEditModal, setShowEditModal] = useState<boolean>(false);
    const [showExtendModal, setShowExtendModal] = useState<boolean>(false);
    const [showCloseReopenModal, setShowCloseReopenModal] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

    // Extend modal state
    const [newDeadline, setNewDeadline] = useState<string>('');
    const [extendLoading, setExtendLoading] = useState<boolean>(false);

    // Action loading states
    const [actionLoading, setActionLoading] = useState<boolean>(false);
    const [exportExcelLoading, setExportExcelLoading] = useState<boolean>(false);
    const [exportPdfLoading, setExportPdfLoading] = useState<boolean>(false);

    useEffect(() => {
        loadData();
    }, [driveId]);

    const loadData = async () => {
        if (!driveId) return;
        try {
            setLoading(true);
            const fetchedDrive = await getDriveById(driveId);
            if (!fetchedDrive) {
                toast.error("Drive not found.");
                navigate('/admin/events');
                return;
            }
            
            // Auto-close check
            if (fetchedDrive.status === 'open' && new Date(fetchedDrive.deadline) < new Date()) {
                await closeDrive(driveId);
                fetchedDrive.status = 'closed';
                toast.success("Drive deadline passed, automatically closed.");
            }
            
            setDrive(fetchedDrive);
            
            const fetchedCadets = await getEligibleCadetsWithResponses(driveId, fetchedDrive.targetDivision, fetchedDrive.targetNccYear);
            setCadets(fetchedCadets);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load drive details");
        } finally {
            setLoading(false);
        }
    };

    const toggleRow = (cadetId: string) => {
        const next = new Set(expandedRows);
        if (next.has(cadetId)) {
            next.delete(cadetId);
        } else {
            next.add(cadetId);
        }
        setExpandedRows(next);
    };

    const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    };

    const handleFilterChange = (e: ChangeEvent<HTMLSelectElement>) => {
        setFilterResponse(e.target.value);
        setCurrentPage(1);
    };

    const [extendError, setExtendError] = useState<string>('');

    const handleExtendDeadline = async () => {
        if (!driveId || !drive) return;
        setExtendError('');
        const selectedDeadline = new Date(newDeadline);
        const now = new Date();
        if (selectedDeadline < now) {
            setExtendError('Deadline cannot be in the past');
            return;
        }
        try {
            setExtendLoading(true);
            await updateDrive(driveId, { deadline: new Date(newDeadline).toISOString() });
            toast.success("Deadline extended successfully");
            setShowExtendModal(false);
            loadData();
        } catch (error) {
            console.error(error);
            toast.error("Failed to extend deadline");
        } finally {
            setExtendLoading(false);
        }
    };

    const handleToggleStatus = async () => {
        if (!driveId || !drive) return;
        try {
            setActionLoading(true);
            if (drive.status === 'open') {
                await closeDrive(driveId);
                toast.success("Drive closed successfully");
            } else {
                await reopenDrive(driveId);
                toast.success("Drive reopened successfully");
            }
            setShowCloseReopenModal(false);
            loadData();
        } catch (error) {
            console.error(error);
            toast.error(`Failed to ${drive.status === 'open' ? 'close' : 'reopen'} drive`);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!driveId) return;
        try {
            setActionLoading(true);
            await deleteDrive(driveId);
            toast.success("Drive deleted successfully");
            setShowDeleteModal(false);
            navigate('/dashboard/event-drives');
        } catch (error) {
            console.error(error);
            toast.error("Failed to delete drive");
        } finally {
            setActionLoading(false);
        }
    };

    const handleExportExcel = async () => {
        if (!driveId || !drive) return;
        try {
            setExportExcelLoading(true);
            await exportResponsesAsExcel({ ...drive, id: driveId }, cadets, filterResponse !== 'all' ? DRIVE_RESPONSE_LABELS[filterResponse as DriveResponseType] : undefined);
            toast.success("Exported to Excel");
        } catch (error) {
            console.error(error);
            toast.error("Failed to export Excel");
        } finally {
            setExportExcelLoading(false);
        }
    };

    const handleExportPdf = async () => {
        if (!driveId || !drive) return;
        try {
            setExportPdfLoading(true);
            await exportResponsesAsPdf({ ...drive, id: driveId }, cadets, filterResponse !== 'all' ? DRIVE_RESPONSE_LABELS[filterResponse as DriveResponseType] : undefined);
            toast.success("Exported to PDF");
        } catch (error) {
            console.error(error);
            toast.error("Failed to export PDF");
        } finally {
            setExportPdfLoading(false);
        }
    };

    const handleSaveEdit = async (data: CreateDriveData) => {
        if (!driveId) return;
        try {
            await updateDrive(driveId, data as any);
            toast.success("Drive updated successfully");
            setShowEditModal(false);
            loadData();
        } catch (error) {
            console.error(error);
            toast.error("Failed to update drive");
        }
    };

    if (loading || !drive) {
        return (
            <Container className="py-4 text-center">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Loading drive details...</p>
            </Container>
        );
    }

    // Processing cadets
    let filteredCadets = cadets;
    if (filterResponse !== 'all') {
        filteredCadets = filteredCadets.filter(c => c.response === filterResponse);
    }
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filteredCadets = filteredCadets.filter(c => 
            c.name.toLowerCase().includes(query) || 
            c.regimentalNumber?.toLowerCase().includes(query)
        );
    }

    const totalItems = filteredCadets.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
    const startIndex = (currentPage - 1) * rowsPerPage;
    const currentCadets = filteredCadets.slice(startIndex, startIndex + rowsPerPage);

    // Summary counts
    const optedInCount = cadets.filter(c => c.response === 'opted_in').length;
    const optedOutCount = cadets.filter(c => c.response === 'opted_out').length;
    const noResponseCount = cadets.filter(c => c.response === 'no_response').length;

    const isPastDeadline = new Date(drive.deadline) < new Date();

    return (
        <Container className="py-4">
            <div className="d-flex align-items-center mb-4">
                <Link to="/admin/event-drives" className="btn btn-outline-secondary me-3">
                    <i className="bi bi-arrow-left"></i> Back
                </Link>
                <h2 className="mb-0">Drive Details</h2>
            </div>

            <Card className="mb-4 shadow-sm border-0">
                <Card.Body>
                    <Card.Title className="fs-4 mb-4">{drive.title}</Card.Title>
                    <Row className="gy-3">
                        <Col md={6}>
                            <strong>Type:</strong> {drive.driveType === 'other' ? drive.customDriveType : DRIVE_TYPE_LABELS[drive.driveType as DriveType]}
                        </Col>
                        <Col md={6}>
                            <strong>Target:</strong> {drive.targetNccYear}
                        </Col>
                        <Col md={6}>
                            <strong>Date:</strong> {formatISTDate(drive.date)}
                        </Col>
                        <Col md={6}>
                            <strong>Deadline:</strong> {formatISTDateTime(drive.deadline)}
                        </Col>
                        <Col md={6}>
                            <strong>Location:</strong> {drive.location || 'Not Provided'}
                        </Col>
                        <Col md={6}>
                            <strong>Capacity:</strong> {drive.capacity ? drive.capacity : 'As many cadets as possible'}
                        </Col>
                        <Col md={6}>
                            <strong>Status:</strong>{' '}
                            <Badge bg={drive.status === 'open' ? 'success' : 'secondary'}>
                                {drive.status.toUpperCase()}
                            </Badge>
                        </Col>
                    </Row>
                </Card.Body>
                <Card.Footer className="bg-white border-top-0 pt-0">
                    <div className="d-flex flex-wrap gap-2">
                        <Button 
                            variant="outline-primary" 
                            onClick={() => {
                                setNewDeadline(toISTDateTimeInputValue(drive.deadline));
                                setShowExtendModal(true);
                            }}
                        >
                            <i className="bi bi-calendar-plus me-1"></i> Extend Deadline
                        </Button>
                        {drive.status === 'open' ? (
                            <Button variant="warning" onClick={() => setShowCloseReopenModal(true)}>
                                <i className="bi bi-door-closed me-1"></i> Close Drive
                            </Button>
                        ) : (
                            <Button 
                                variant="success" 
                                onClick={() => setShowCloseReopenModal(true)}
                                disabled={isPastDeadline}
                                title={isPastDeadline ? "Cannot reopen drive if deadline has passed. Extend deadline first." : ""}
                            >
                                <i className="bi bi-door-open me-1"></i> Reopen Drive
                            </Button>
                        )}
                        <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                            <i className="bi bi-trash me-1"></i> Delete Drive
                        </Button>
                        <div className="ms-auto d-flex gap-2">
                            <Button 
                                variant="outline-success" 
                                onClick={handleExportExcel}
                                disabled={exportExcelLoading}
                            >
                                {exportExcelLoading ? 'Exporting...' : <><i className="bi bi-file-earmark-excel me-1"></i> Excel</>}
                            </Button>
                            <Button 
                                variant="outline-danger" 
                                onClick={handleExportPdf}
                                disabled={exportPdfLoading}
                            >
                                {exportPdfLoading ? 'Exporting...' : <><i className="bi bi-file-earmark-pdf me-1"></i> PDF</>}
                            </Button>
                        </div>
                    </div>
                </Card.Footer>
            </Card>

            <Row className="mb-4 gy-3">
                <Col md={4}>
                    <Card className="text-center shadow-sm border-0 border-start border-success border-4">
                        <Card.Body>
                            <h3 className="text-success mb-1">{optedInCount}</h3>
                            <div className="text-muted">Opted In</div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="text-center shadow-sm border-0 border-start border-danger border-4">
                        <Card.Body>
                            <h3 className="text-danger mb-1">{optedOutCount}</h3>
                            <div className="text-muted">Opted Out</div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4}>
                    <Card className="text-center shadow-sm border-0 border-start border-warning border-4">
                        <Card.Body>
                            <h3 className="text-warning mb-1">{noResponseCount}</h3>
                            <div className="text-muted">No Response</div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Card className="shadow-sm border-0 mb-4">
                <Card.Header className="bg-white py-3">
                    <h5 className="mb-0">Cadet Responses</h5>
                </Card.Header>
                <Card.Body>
                    <Row className="mb-3 gy-2">
                        <Col md={4}>
                            <Form.Select value={filterResponse} onChange={handleFilterChange}>
                                <option value="all">All Responses</option>
                                <option value="opt_in">Opted In</option>
                                <option value="opt_out">Opted Out</option>
                                <option value="no_response">No Response</option>
                            </Form.Select>
                        </Col>
                        <Col md={6}>
                            <Form.Control 
                                type="text" 
                                placeholder="Search by name or regimental number..." 
                                value={searchQuery}
                                onChange={handleSearchChange}
                            />
                        </Col>
                        <Col md={2}>
                            <Button 
                                variant="outline-secondary" 
                                className="w-100"
                                onClick={() => { setSearchQuery(''); setFilterResponse('all'); setCurrentPage(1); }}
                            >
                                Clear
                            </Button>
                        </Col>
                    </Row>

                    <div className="table-responsive">
                        <Table hover>
                            <thead className="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Regimental No.</th>
                                    <th>Rank</th>
                                    <th>Response</th>
                                    <th style={{ width: '40px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentCadets.length > 0 ? (
                                    currentCadets.map((cadet, index) => {
                                        const isExpanded = expandedRows.has(cadet.uid);
                                        const responseBadgeBg = 
                                            cadet.response === 'opted_in' ? 'success' : 
                                            cadet.response === 'opted_out' ? 'danger' : 'warning';
                                        
                                        return (
                                            <Fragment key={cadet.uid}>
                                                <tr 
                                                    style={{ cursor: 'pointer' }} 
                                                    onClick={() => toggleRow(cadet.uid)}
                                                >
                                                    <td>{startIndex + index + 1}</td>
                                                    <td>{cadet.name}</td>
                                                    <td>{cadet.regimentalNumber || '-'}</td>
                                                    <td>{cadet.rank || 'CDT'}</td>
                                                    <td>
                                                        <Badge bg={responseBadgeBg}>
                                                            {DRIVE_RESPONSE_LABELS[cadet.response] || cadet.response}
                                                        </Badge>
                                                    </td>
                                                    <td className="text-center text-muted">
                                                        <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td colSpan={6} className="p-0 border-0">
                                                        <Collapse in={isExpanded}>
                                                            <div className="bg-light p-3 border-bottom">
                                                                <Row className="gy-2 text-sm">
                                                                    <Col md={4}>
                                                                        <strong>Department:</strong> {cadet.department || 'N/A'}
                                                                    </Col>
                                                                    <Col md={4}>
                                                                        <strong>Phone:</strong> {cadet.phone || 'N/A'}
                                                                    </Col>
                                                                    {cadet.response !== 'no_response' && (
                                                                        <Col md={4}>
                                                                            <strong>Response Time:</strong> {cadet.respondedAt ? formatISTDateTime(cadet.respondedAt) : 'N/A'}
                                                                        </Col>
                                                                    )}
                                                                    {cadet.response === 'opted_out' && (
                                                                        <Col md={12} className="mt-2">
                                                                            <strong>Reason:</strong> {cadet.reason || 'None provided'}
                                                                        </Col>
                                                                    )}
                                                                </Row>
                                                            </div>
                                                        </Collapse>
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="text-center py-4">
                                            No cadets found matching the filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    </div>

                    <TablePaginationFooter 
                        totalItems={filteredCadets.length}
                        currentPage={currentPage}
                        rowsPerPage={rowsPerPage}
                        onRowsPerPageChange={setRowsPerPage}
                        onFirstPage={() => setCurrentPage(1)}
                        onPreviousPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        onLastPage={() => setCurrentPage(totalPages)}
                    />
                </Card.Body>
            </Card>

            {/* Modals */}
            <CreateEditDriveModal
                show={showEditModal}
                onHide={() => setShowEditModal(false)}
                onSave={handleSaveEdit}
                editDrive={drive as EventDrive & { id: string }}
                createdBy={drive.createdBy}
            />

            <Modal show={showExtendModal} onHide={() => setShowExtendModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Extend Deadline</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group>
                        <Form.Label>New Deadline</Form.Label>
                        <Form.Control 
                            type="datetime-local" 
                            value={newDeadline}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDeadline(e.target.value)}
                            min={toISTDateTimeInputValue(new Date())}
                            isInvalid={!!extendError}
                        />
                        <Form.Control.Feedback type="invalid">{extendError}</Form.Control.Feedback>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowExtendModal(false)}>Cancel</Button>
                    <Button variant="primary" onClick={handleExtendDeadline} disabled={extendLoading || !newDeadline}>
                        {extendLoading ? 'Saving...' : 'Save Extension'}
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showCloseReopenModal} onHide={() => setShowCloseReopenModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>{drive.status === 'open' ? 'Close' : 'Reopen'} Drive</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to {drive.status === 'open' ? 'close' : 'reopen'} <strong>{drive.title}</strong>?
                    {drive.status === 'open' && (
                        <p className="text-muted mt-2 mb-0">Closing the drive will prevent further responses from cadets.</p>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowCloseReopenModal(false)}>Cancel</Button>
                    <Button 
                        variant={drive.status === 'open' ? 'warning' : 'success'} 
                        onClick={handleToggleStatus} 
                        disabled={actionLoading}
                    >
                        {actionLoading ? 'Processing...' : `Confirm ${drive.status === 'open' ? 'Close' : 'Reopen'}`}
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Delete Drive</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-danger mb-0">
                        Are you sure you want to delete <strong>{drive.title}</strong>? This action cannot be undone and will delete all associated responses.
                    </p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
                    <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>
                        {actionLoading ? 'Deleting...' : 'Delete Drive'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
}
