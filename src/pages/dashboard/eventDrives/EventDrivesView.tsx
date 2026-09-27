import { useState, useEffect, useMemo, type ChangeEvent } from "react";
import {
  Container,
  Card,
  Badge,
  Button,
  Form,
  Spinner,
  Alert,
  Row,
  Col,
  Modal,
} from "react-bootstrap";
import toast from "react-hot-toast";
import { useAuth } from "@/features/auth/AuthContext";
import { getDrives } from "@/features/eventDrives/eventDriveService";
import {
  getMyResponse,
  submitResponse,
} from "@/features/eventDrives/responseService";
import {
  DRIVE_TYPE_LABELS,
  DRIVE_RESPONSE,
  DRIVE_RESPONSE_LABELS,
} from "@/shared/config/constants";
import type { DriveType, DriveResponseType } from "@/shared/config/constants";
import type { EventDrive, DriveResponse } from "@/shared/types";
import { formatISTDate, formatISTDateTime } from "@/shared/utils/dateTime";
import { TablePaginationFooter } from "@/components";

type StatusTab = "active" | "completed" | "all";
type ResponseTab = "all_resp" | "opted_in" | "opted_out" | "no_response";

export default function EventDrivesView() {
  const { currentUser, userProfile } = useAuth();

  const [allDrives, setAllDrives] = useState<(EventDrive & { id: string })[]>([]);
  const [responses, setResponses] = useState<Record<string, DriveResponse | null>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const [selectedResponse, setSelectedResponse] = useState<Record<string, DriveResponseType>>({});
  const [optOutReasons, setOptOutReasons] = useState<Record<string, string>>({});

  // Filters
  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [responseTab, setResponseTab] = useState<ResponseTab>("all_resp");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);

  // Modal for responding
  const [respondDriveId, setRespondDriveId] = useState<string | null>(null);

  const profileData = userProfile as {
    name?: string;
    division?: string;
    nccYear?: string;
    [key: string]: unknown;
  } | null;
  const userDivision = profileData?.division || "";
  const userNccYear = profileData?.nccYear || "";
  const userName = profileData?.name || "";

  useEffect(() => {
    async function loadData() {
      if (!currentUser?.uid || !userDivision || !userNccYear) {
        setLoading(false);
        return;
      }

      try {
        const fetchedDrives = await getDrives();

        const myDrives = fetchedDrives.filter(
          (drive) =>
            drive.targetDivision === userDivision &&
            drive.targetNccYear === userNccYear,
        );

        setAllDrives(myDrives);

        // Fetch responses using Promise.all
        const driveIds = myDrives.map((d) => d.id);
        const responsePromises = driveIds.map((id) =>
          getMyResponse(id, currentUser.uid),
        );
        const fetchedResponses = await Promise.all(responsePromises);

        const responseMap: Record<string, DriveResponse | null> = {};
        const initialSelected: Record<string, DriveResponseType> = {};
        const initialReasons: Record<string, string> = {};

        driveIds.forEach((id, index) => {
          const resp = fetchedResponses[index];
          responseMap[id] = resp;
          if (resp) {
            initialSelected[id] = resp.response;
            initialReasons[id] = resp.reason || "";
          }
        });

        setResponses(responseMap);
        setSelectedResponse(initialSelected);
        setOptOutReasons(initialReasons);
      } catch (error) {
        console.error("Error loading event drives:", error);
        toast.error("Failed to load event drives.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [currentUser, userDivision, userNccYear]);

  // Helpers
  const isActive = (drive: EventDrive) => {
    const now = new Date();
    return drive.status === "open" && new Date(drive.deadline) >= now;
  };

  const getMyResponseType = (driveId: string): DriveResponseType | "no_response" => {
    const resp = responses[driveId];
    return resp ? resp.response : "no_response";
  };

  // Counts
  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let optedIn = 0;
    let optedOut = 0;
    let noResp = 0;

    allDrives.forEach((d) => {
      if (isActive(d)) active++;
      else completed++;

      const r = getMyResponseType(d.id);
      if (r === "opted_in") optedIn++;
      else if (r === "opted_out") optedOut++;
      else noResp++;
    });

    return { active, completed, all: allDrives.length, optedIn, optedOut, noResp };
  }, [allDrives, responses]);

  // Filter drives
  const filteredDrives = useMemo(() => {
    let result = allDrives;

    // Status filter
    if (statusTab === "active") {
      result = result.filter(isActive);
    } else if (statusTab === "completed") {
      result = result.filter((d) => !isActive(d));
    }

    // Response filter
    if (responseTab !== "all_resp") {
      result = result.filter((d) => getMyResponseType(d.id) === responseTab);
    }

    return result;
  }, [allDrives, responses, statusTab, responseTab]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusTab, responseTab, rowsPerPage]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredDrives.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const paginatedDrives = filteredDrives.slice(startIndex, startIndex + rowsPerPage);

  const handleResponseChange = (
    driveId: string,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    setSelectedResponse((prev) => ({
      ...prev,
      [driveId]: e.target.value as DriveResponseType,
    }));
  };

  const handleReasonChange = (
    driveId: string,
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setOptOutReasons((prev) => ({
      ...prev,
      [driveId]: e.target.value,
    }));
  };

  const handleSubmit = async (driveId: string) => {
    if (!currentUser) return;

    const responseType = selectedResponse[driveId];
    if (!responseType) {
      toast.error("Please select a response.");
      return;
    }

    try {
      setSubmitting(driveId);

      await submitResponse(driveId, {
        cadetUid: currentUser.uid,
        cadetName: userName,
        division: userDivision as "SD" | "SW",
        nccYear: userNccYear,
        response: responseType,
        reason:
          responseType === DRIVE_RESPONSE.OPTED_OUT
            ? (optOutReasons[driveId] || "").trim()
            : "",
      });

      const updatedResponse = await getMyResponse(driveId, currentUser.uid);
      setResponses((prev) => ({
        ...prev,
        [driveId]: updatedResponse,
      }));

      toast.success("Response submitted successfully.");
      setRespondDriveId(null);
    } catch (error) {
      console.error("Error submitting response:", error);
      toast.error("Failed to submit response.");
    } finally {
      setSubmitting(null);
    }
  };

  const renderDriveType = (drive: EventDrive) => {
    return drive.driveType === "other"
      ? drive.customDriveType || "Other"
      : DRIVE_TYPE_LABELS[drive.driveType as DriveType] || drive.driveType;
  };

  const getResponseBadge = (driveId: string) => {
    const respType = getMyResponseType(driveId);
    if (respType === "opted_in") return <Badge bg="success" className="small">{DRIVE_RESPONSE_LABELS[DRIVE_RESPONSE.OPTED_IN]}</Badge>;
    if (respType === "opted_out") return <Badge bg="danger" className="small">{DRIVE_RESPONSE_LABELS[DRIVE_RESPONSE.OPTED_OUT]}</Badge>;
    return <Badge bg="warning" text="dark" className="small">No Response</Badge>;
  };

  // The drive being responded to
  const respondDrive = respondDriveId ? allDrives.find((d) => d.id === respondDriveId) : null;

  if (loading) {
    return (
      <Container className="py-4 text-center">
        <Spinner animation="border" role="status" />
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <h2 className="mb-3">Event Drives</h2>

      {!userDivision || !userNccYear ? (
        <Alert variant="warning">
          Please update your profile with your division and NCC year to see
          relevant event drives.
        </Alert>
      ) : (
        <>
          {/* Status filter tabs */}
          <div className="d-flex flex-wrap gap-2 mb-3">
            <Button
              variant={statusTab === "active" ? "primary" : "outline-primary"}
              size="sm"
              className="rounded-pill"
              onClick={() => setStatusTab("active")}
            >
              Active ({counts.active})
            </Button>
            <Button
              variant={statusTab === "completed" ? "secondary" : "outline-secondary"}
              size="sm"
              className="rounded-pill"
              onClick={() => setStatusTab("completed")}
            >
              Completed ({counts.completed})
            </Button>
            <Button
              variant={statusTab === "all" ? "dark" : "outline-dark"}
              size="sm"
              className="rounded-pill"
              onClick={() => setStatusTab("all")}
            >
              All ({counts.all})
            </Button>

            <span className="border-start mx-1"></span>

            {/* Response filter tabs */}
            <Button
              variant={responseTab === "all_resp" ? "info" : "outline-info"}
              size="sm"
              className="rounded-pill"
              onClick={() => setResponseTab("all_resp")}
            >
              All
            </Button>
            <Button
              variant={responseTab === "opted_in" ? "success" : "outline-success"}
              size="sm"
              className="rounded-pill"
              onClick={() => setResponseTab("opted_in")}
            >
              Opted In ({counts.optedIn})
            </Button>
            <Button
              variant={responseTab === "opted_out" ? "danger" : "outline-danger"}
              size="sm"
              className="rounded-pill"
              onClick={() => setResponseTab("opted_out")}
            >
              Opted Out ({counts.optedOut})
            </Button>
            <Button
              variant={responseTab === "no_response" ? "warning" : "outline-warning"}
              size="sm"
              className="rounded-pill"
              onClick={() => setResponseTab("no_response")}
            >
              No Response ({counts.noResp})
            </Button>

            {(statusTab !== "active" || responseTab !== "all_resp") && (
              <>
                <span className="border-start mx-1"></span>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="rounded-pill"
                  onClick={() => { setStatusTab("active"); setResponseTab("all_resp"); }}
                >
                  <i className="bi bi-x-circle me-1"></i>Clear Filters
                </Button>
              </>
            )}
          </div>

          {/* Drive cards grid */}
          {filteredDrives.length === 0 ? (
            <p className="text-muted py-4 text-center">No event drives found matching the filters.</p>
          ) : (
            <>
              <Row className="g-3">
                {paginatedDrives.map((drive) => {
                  const driveId = drive.id;
                  const driveIsActive = isActive(drive);

                  return (
                    <Col key={driveId} xs={12} sm={6} lg={4} xl={3}>
                      <Card
                        className={`h-100 shadow-sm ${driveIsActive ? 'border-primary' : 'border-0'}`}
                        style={{ cursor: 'pointer', fontSize: '0.9rem' }}
                        onClick={() => setRespondDriveId(driveId)}
                      >
                        <Card.Body className="pb-0">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            {getResponseBadge(driveId)}
                            <Badge bg="light" text="dark" className="small border">
                              {renderDriveType(drive)}
                            </Badge>
                          </div>

                          <h6 className="fw-bold mb-1">{drive.title}</h6>
                          {drive.description && (
                            <p className="text-muted small mb-2" style={{ 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {drive.description}
                            </p>
                          )}

                          <div className="small text-muted mb-2">
                            {drive.location && (
                              <span className="d-block"><i className="bi bi-geo-alt me-1"></i>{drive.location}</span>
                            )}
                            <span className="d-block"><i className="bi bi-calendar-event me-1"></i>{formatISTDate(drive.date)}</span>
                          </div>
                        </Card.Body>

                        <Card.Footer
                          className={`small fw-semibold text-white border-0 ${driveIsActive ? 'bg-primary' : 'bg-secondary'}`}
                          style={{ fontSize: '0.78rem' }}
                        >
                          <i className="bi bi-clock me-1"></i>
                          {driveIsActive ? 'Respond Before' : 'Closed'}{' '}
                          {formatISTDateTime(drive.deadline)}
                        </Card.Footer>
                      </Card>
                    </Col>
                  );
                })}
              </Row>

              {filteredDrives.length > rowsPerPage && (
                <div className="mt-3">
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
                </div>
              )}
            </>
          )}

          {/* Respond modal */}
          <Modal
            show={!!respondDriveId && !!respondDrive}
            onHide={() => setRespondDriveId(null)}
            centered
          >
            {respondDrive && (
              (() => {
                const isModalDriveActive = isActive(respondDrive);
                const myResp = responses[respondDrive.id];

                return (
                  <>
                    <Modal.Header closeButton>
                      <Modal.Title className="fs-6">{respondDrive.title}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                      <div className="mb-3 small text-muted">
                        <p className="mb-1"><strong>Type:</strong> {renderDriveType(respondDrive)}</p>
                        <p className="mb-1"><strong>Date:</strong> {formatISTDate(respondDrive.date)}</p>
                        <p className="mb-1">
                          <strong>Deadline:</strong>{' '}
                          <span className={isModalDriveActive ? 'text-danger' : 'text-muted'}>
                            {formatISTDateTime(respondDrive.deadline)}
                          </span>
                        </p>
                        {respondDrive.location && <p className="mb-1"><strong>Location:</strong> {respondDrive.location}</p>}
                        {respondDrive.description && <p className="mb-1"><strong>Description:</strong> {respondDrive.description}</p>}
                      </div>

                      <hr />

                      {isModalDriveActive ? (
                        <>
                          <Form.Group className="mb-3">
                            <Form.Label className="fw-bold">Your Response</Form.Label>
                            <div>
                              <Form.Check
                                inline
                                type="radio"
                                id={`modal-resp-in-${respondDriveId}`}
                                // label={DRIVE_RESPONSE_LABELS[DRIVE_RESPONSE.OPTED_IN]}
                                label={"Opt In"}
                                name={`modal-response-${respondDriveId}`}
                                value={DRIVE_RESPONSE.OPTED_IN}
                                checked={selectedResponse[respondDriveId!] === DRIVE_RESPONSE.OPTED_IN}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleResponseChange(respondDriveId!, e)}
                              />
                              <Form.Check
                                inline
                                type="radio"
                                id={`modal-resp-out-${respondDriveId}`}
                                // label={DRIVE_RESPONSE_LABELS[DRIVE_RESPONSE.OPTED_OUT]}
                                label={"Opt Out"}
                                name={`modal-response-${respondDriveId}`}
                                value={DRIVE_RESPONSE.OPTED_OUT}
                                checked={selectedResponse[respondDriveId!] === DRIVE_RESPONSE.OPTED_OUT}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleResponseChange(respondDriveId!, e)}
                              />
                            </div>
                          </Form.Group>

                          {selectedResponse[respondDriveId!] === DRIVE_RESPONSE.OPTED_OUT && (
                            <Form.Group className="mb-3">
                              <Form.Label className="small">Reason for Opting Out</Form.Label>
                              <Form.Control
                                size="sm"
                                type="text"
                                placeholder="Provide a valid reason..."
                                value={optOutReasons[respondDriveId!] || ""}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleReasonChange(respondDriveId!, e)}
                              />
                            </Form.Group>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-2">
                          <p className="text-muted mb-2">This drive is closed.</p>
                          <div>
                            <strong>Response: </strong>
                            {getResponseBadge(respondDrive.id)}
                            {myResp?.response === DRIVE_RESPONSE.OPTED_OUT && (
                              <div className="text-muted mt-2 small">
                                Reason: {myResp.reason || "No reason mentioned"}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Modal.Body>
                    <Modal.Footer>
                      {isModalDriveActive ? (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => setRespondDriveId(null)}>
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!selectedResponse[respondDriveId!] || submitting === respondDriveId}
                            onClick={() => handleSubmit(respondDriveId!)}
                          >
                            {submitting === respondDriveId ? "Submitting..." : responses[respondDriveId!] ? "Update" : "Submit"}
                          </Button>
                        </>
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => setRespondDriveId(null)}>
                          Close
                        </Button>
                      )}
                    </Modal.Footer>
                  </>
                );
              })()
            )}
          </Modal>
        </>
      )}
    </Container>
  );
}
