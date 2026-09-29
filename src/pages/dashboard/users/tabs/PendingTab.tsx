import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Col, Form, Modal, Row, Table } from "react-bootstrap";
import { db, FIREBASE_CONFIG } from "@/shared/config/firebase";
import { useAuth } from "@/features/auth/AuthContext";
import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
import emailjs from "@emailjs/browser";
import { NCC_RANKS, ROMAN_YEAR_MAP } from "@/shared/config/constants";
import {
  doc,
  deleteDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import toast from "react-hot-toast";
import {
  triggerAuthCleanup,
  triggerVerificationSync,
} from "@/shared/utils/githubActions";
import { TablePaginationFooter } from "@/components";
import { deleteTakenNumberBatch } from "@/shared/utils/dbValidators";
import type { ManagedUser, PendingCadet } from "../types";
import "../UserManagement.css";

interface PendingTabProps {
  users: ManagedUser[];
  pendingUsers: PendingCadet[];
  onRefresh: () => Promise<void>;
}

const formatAcademicYear = (value?: string) => {
  if (!value) return "-";
  const cleaned = value.replace(" Year", "").trim();
  return ROMAN_YEAR_MAP[cleaned] || cleaned;
};

const formatDateDDMMYYYY = (dateString?: string) => {
  if (!dateString) return "-";
  const parts = dateString.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
};

const PendingTab: React.FC<PendingTabProps> = ({
  users,
  pendingUsers: pending,
  onRefresh,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: "approve" | "reject";
    payload: PendingCadet;
  } | null>(null);
  const [viewCadet, setViewCadet] = useState<PendingCadet | null>(null);

  // Filter states for pending approvals
  const [divisionFilter, setDivisionFilter] = useState<"ALL" | "SD" | "SW">(
    "ALL",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingCurrentPage, setPendingCurrentPage] = useState(1);
  const [pendingRowsPerPage, setPendingRowsPerPage] = useState(10);

  useEffect(() => {
    setPendingCurrentPage(1);
  }, [divisionFilter, searchTerm, pendingRowsPerPage]);

  const handleApprove = async (candidate: PendingCadet) => {
    setSaving(true);
    try {
      // Use the uid from the pending record (Auth account already created during registration)
      let authUid = candidate.uid || candidate.id;

      // If no uid stored (legacy pending record), create Auth account via secondary app
      if (!candidate.uid && candidate.tempPassword) {
        try {
          const secondaryApp = initializeApp(FIREBASE_CONFIG, "Secondary");
          const secondaryAuth = getAuth(secondaryApp);

          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth,
            candidate.email,
            candidate.tempPassword,
          );
          authUid = userCredential.user.uid;

          await signOut(secondaryAuth);
          await deleteApp(secondaryApp);
        } catch (authError: any) {
          console.error("Firebase Auth error:", authError);
          toast.error(
            "Failed to create Firebase Auth account: " + authError.message,
          );
          return;
        }
      }

      // Create user document in Firestore
      const userDoc = doc(db, "users", authUid);
      await setDoc(userDoc, {
        name: candidate.name,
        email: candidate.email,
        role: "member",
        userType: "cadet",
        status: "active",
        createdAt: candidate.createdAt || new Date().toISOString(),
        dateOfBirth: candidate.dateOfBirth,
        regimentalNumber: candidate.regimentalNumber,
        division: candidate.division,
        dateOfEnrollment: candidate.dateOfEnrollment,
        rank: candidate.rank || "CDT",
        nccYear: candidate.nccYear || "1st Year",
        year: candidate.year,
        residentialStatus: candidate.residentialStatus,
        department: candidate.department,
        rollNo: candidate.rollNo,
        registerNumber: candidate.registerNumber,
        phone: candidate.phone,
        bloodGroup: candidate.bloodGroup,
        fatherName: candidate.fatherName || "",
        address: candidate.address || "",
        photoURL: candidate.photoURL || null,
        cloudinaryPublicId: candidate.cloudinaryPublicId || null,
      });

      // Delete from pending collection
      await deleteDoc(doc(db, "pendingCadets", candidate.id));

      // Send approval email via EmailJS
      try {
        const adminRankCode = (userProfile as any)?.rank;
        const adminRankFull =
          NCC_RANKS.find((r) => r.code === adminRankCode)?.name ||
          adminRankCode ||
          "";

        await emailjs.send(
          import.meta.env.VITE_EMAILJS_SERVICE_ID,
          import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
          {
            to_email: candidate.email,
            to_name: candidate.name,
            regimental_number: candidate.regimentalNumber || "",
            rank: "Cadet",
            admin_name: userProfile?.name || "NCC Admin",
            admin_rank: adminRankFull,
            admin_email: userProfile?.email || "tce.nccarmywing@gmail.com",
            approval_date: new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
            approval_time: new Date().toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
          },
          import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
        );
      } catch (emailError) {
        console.error("Failed to send approval email:", emailError);
        toast.error("Account created, but failed to send approval email.");
      }

      toast.success("Cadet approved and account created successfully!");
      await onRefresh();
    } catch (e) {
      console.error(e);
      toast.error("Approval failed");
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  const handleReject = async (candidate: PendingCadet) => {
    setSaving(true);
    try {
      // Queue Auth account deletion via GitHub Actions
      if (candidate.uid) {
        try {
          await setDoc(doc(db, "pendingAuthDeletions", candidate.uid), {
            email: candidate.email,
            name: candidate.name,
            reason: "registration_rejected",
            queuedAt: new Date().toISOString(),
            queuedBy: currentUser?.uid || "unknown",
          });
          // Trigger cleanup action
          triggerAuthCleanup().catch(() => {});
        } catch (authError: any) {
          console.warn("Could not queue auth deletion:", authError);
          // Non-fatal: we still want to delete the pending doc
        }
      }

      // Delete from pending collection
      await deleteDoc(doc(db, "pendingCadets", candidate.id));

      // Free up taken numbers
      const batch = writeBatch(db);
      deleteTakenNumberBatch(
        batch,
        "regimentalNumber",
        candidate.regimentalNumber,
      );
      deleteTakenNumberBatch(batch, "registerNumber", candidate.registerNumber);
      deleteTakenNumberBatch(batch, "rollNo", candidate.rollNo);
      await batch.commit();

      toast.success("Registration rejected and account removed");
      await onRefresh();
    } catch (e) {
      console.error(e);
      toast.error("Reject failed");
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  useEffect(() => {
    if (pending.some((p) => !p.emailVerified)) {
      triggerVerificationSync();
    }
  }, [pending]);

  // Filter and sort pending cadets
  const filteredPending = useMemo(() => {
    // First, filter out cadets whose emails are already in users collection (already approved)
    const existingEmails = new Set(users.map((u) => u.email.toLowerCase()));
    let filtered = pending.filter(
      (c) => !existingEmails.has(c.email.toLowerCase()),
    );

    // Filter by division
    if (divisionFilter !== "ALL") {
      filtered = filtered.filter((c) => c.division === divisionFilter);
    }

    // Filter by search term (regimental number or name)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.regimentalNumber?.toLowerCase().includes(term) ||
          c.name?.toLowerCase().includes(term),
      );
    }

    // Sort by regimental number (default)
    filtered.sort((a, b) => {
      const regA = a.regimentalNumber || "";
      const regB = b.regimentalNumber || "";
      return regA.localeCompare(regB, undefined, { numeric: true });
    });

    return filtered;
  }, [pending, users, divisionFilter, searchTerm]);

  const clearFilters = () => {
    setDivisionFilter("ALL");
    setSearchTerm("");
  };

  const pendingTotalPages = Math.max(
    1,
    Math.ceil(filteredPending.length / pendingRowsPerPage),
  );
  const pendingSafePage = Math.min(pendingCurrentPage, pendingTotalPages);
  const pendingStartIndex = (pendingSafePage - 1) * pendingRowsPerPage;
  const pendingEndIndex = Math.min(
    pendingStartIndex + pendingRowsPerPage,
    filteredPending.length,
  );
  const paginatedPending = filteredPending.slice(
    pendingStartIndex,
    pendingEndIndex,
  );

  const DetailRow = ({
    label,
    value,
    icon,
  }: {
    label: string;
    value?: string | null;
    icon?: string;
  }) => (
    <Row className="mb-2 align-items-start">
      <Col xs={5} className="text-muted small fw-semibold">
        {icon && <i className={`bi bi-${icon} me-2`}></i>}
        {label}
      </Col>
      <Col xs={7} className="small">
        {value || <span className="text-muted fst-italic">Not provided</span>}
      </Col>
    </Row>
  );

  return (
    <>
      <Alert variant="warning">
        Approve or reject newly registered cadets. Approval will create
        a user record with Member role.
      </Alert>

      {/* Filter controls */}
      <Row className="mb-3 g-3">
        <Col xs={12} md={3}>
          <Form.Label className="small fw-semibold">Division</Form.Label>
          <div className="btn-group w-100" role="group">
            <input
              type="radio"
              className="btn-check"
              name="division-filter"
              id="division-all"
              checked={divisionFilter === "ALL"}
              onChange={() => setDivisionFilter("ALL")}
            />
            <label className="btn btn-outline-primary" htmlFor="division-all">
              Both
            </label>

            <input
              type="radio"
              className="btn-check"
              name="division-filter"
              id="division-sd"
              checked={divisionFilter === "SD"}
              onChange={() => setDivisionFilter("SD")}
            />
            <label className="btn btn-outline-primary" htmlFor="division-sd">
              SD
            </label>

            <input
              type="radio"
              className="btn-check"
              name="division-filter"
              id="division-sw"
              checked={divisionFilter === "SW"}
              onChange={() => setDivisionFilter("SW")}
            />
            <label className="btn btn-outline-primary" htmlFor="division-sw">
              SW
            </label>
          </div>
        </Col>
        <Col xs={12} md={4}>
          <Form.Label className="small fw-semibold">Search</Form.Label>
          <Form.Control
            type="text"
            placeholder="Search by name or regimental number..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
          />
        </Col>
        <Col xs={12} md={2} className="d-flex align-items-end">
          <Button
            variant="outline-secondary"
            className="w-100"
            onClick={clearFilters}
          >
            <i className="bi bi-x-circle me-1"></i>
            Clear Filters
          </Button>
        </Col>
      </Row>

      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th className="user-col-sno">S.No</th>
            <th>Name</th>
            <th className="user-col-division">SD/SW</th>
            <th>Regimental Number</th>
            <th>Email</th>
            <th>Email Status</th>
            <th>Registered On</th>
            <th className="user-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedPending.map((c, index) => (
            <tr key={c.id}>
              <td className="text-center">{pendingStartIndex + index + 1}</td>
              <td>{c.name}</td>
              <td className="text-center">
                <Badge bg={c.division === "SD" ? "info" : "warning"}>
                  {c.division}
                </Badge>
              </td>
              <td>{c.regimentalNumber || "N/A"}</td>
              <td>{c.email}</td>
              <td className="text-center">
                {c.emailVerified ? (
                  <Badge bg="success">
                    <i className="bi bi-check-circle me-1"></i>Verified
                  </Badge>
                ) : (
                  <Badge bg="secondary">
                    <i className="bi bi-clock me-1"></i>Pending
                  </Badge>
                )}
              </td>
              <td>{new Date(c.createdAt).toLocaleString()}</td>
              <td className="d-flex gap-2">
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setViewCadet(c)}
                  title="View full registration details"
                >
                  <i className="bi bi-eye-fill"></i>
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  onClick={() =>
                    setConfirm({ action: "approve", payload: c })
                  }
                  disabled={!c.emailVerified}
                  title={
                    !c.emailVerified
                      ? "Email not yet verified"
                      : "Approve this registration"
                  }
                >
                  Accept
                </Button>
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => setConfirm({ action: "reject", payload: c })}
                >
                  Reject
                </Button>
              </td>
            </tr>
          ))}
          {filteredPending.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-muted">
                No pending registrations match filters
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <TablePaginationFooter
        totalItems={filteredPending.length}
        currentPage={pendingSafePage}
        rowsPerPage={pendingRowsPerPage}
        onRowsPerPageChange={setPendingRowsPerPage}
        onFirstPage={() => setPendingCurrentPage(1)}
        onPreviousPage={() =>
          setPendingCurrentPage((page) => Math.max(1, page - 1))
        }
        onNextPage={() =>
          setPendingCurrentPage((page) =>
            Math.min(pendingTotalPages, page + 1),
          )
        }
        onLastPage={() => setPendingCurrentPage(pendingTotalPages)}
      />

      {/* Confirm modal for approve/reject */}
      <Modal show={!!confirm} onHide={() => setConfirm(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm {confirm?.action}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {confirm?.action === "approve" && (
            <>
              <p>
                Approve registration for{" "}
                <strong>{confirm?.payload?.name}</strong> (
                {confirm?.payload?.email})?
              </p>
              {!confirm?.payload?.emailVerified && (
                <Alert variant="warning" className="mb-0">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  This user has <strong>not verified their email</strong> yet.
                  Approval is only available after email verification.
                </Alert>
              )}
            </>
          )}
          {confirm?.action === "reject" && (
            <>
              <p>
                Reject registration for{" "}
                <strong>{confirm?.payload?.name}</strong> (
                {confirm?.payload?.email})?
              </p>
              <Alert variant="info" className="mb-0">
                <i className="bi bi-info-circle me-2"></i>
                This will delete the pending registration and remove their
                Firebase Auth account. No trace will remain.
              </Alert>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setConfirm(null)}
            disabled={saving}
          >
            Cancel
          </Button>
          {confirm?.action === "approve" && (
            <Button
              variant="success"
              onClick={() => handleApprove(confirm.payload)}
              disabled={saving || !confirm.payload?.emailVerified}
            >
              Approve
            </Button>
          )}
          {confirm?.action === "reject" && (
            <Button
              variant="danger"
              onClick={() => handleReject(confirm.payload)}
              disabled={saving}
            >
              Reject
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      {/* Pending Cadet Detail View Modal */}
      <Modal
        show={!!viewCadet}
        onHide={() => setViewCadet(null)}
        centered
        size="lg"
      >
        <Modal.Header closeButton className="bg-primary text-white">
          <Modal.Title>
            <i className="bi bi-person-badge me-2"></i>
            Registration Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewCadet && (
            <>
              {/* Profile Photo & Name Header */}
              <div className="text-center mb-4">
                {viewCadet.photoURL ? (
                  <img
                    src={
                      viewCadet.photoURL?.includes("cloudinary.com") &&
                      viewCadet.photoURL.includes("/upload/")
                        ? viewCadet.photoURL.replace(
                            "/upload/",
                            "/upload/c_fill,g_face,w_400,h_400,q_auto,f_auto/",
                          )
                        : viewCadet.photoURL
                    }
                    alt={`${viewCadet.name}'s photo`}
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "3px solid #dee2e6",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      backgroundColor: "#E8EAF6",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "3px solid #dee2e6",
                    }}
                  >
                    <i
                      className="bi bi-person-fill"
                      style={{ fontSize: 48, color: "#9FA8DA" }}
                    ></i>
                  </div>
                )}
                <h5 className="mt-3 mb-1 fw-bold">{viewCadet.name}</h5>
                <div className="d-flex justify-content-center gap-2">
                  <Badge bg={viewCadet.division === "SD" ? "info" : "warning"}>
                    {viewCadet.division}
                  </Badge>
                  <Badge bg="secondary">{viewCadet.rank || "CDT"}</Badge>
                  {viewCadet.emailVerified ? (
                    <Badge bg="success">
                      <i className="bi bi-check-circle me-1"></i>Email Verified
                    </Badge>
                  ) : (
                    <Badge bg="danger">
                      <i className="bi bi-exclamation-circle me-1"></i>Email Not
                      Verified
                    </Badge>
                  )}
                </div>
              </div>

              <hr />

              <Row>
                {/* Left column: Personal Details */}
                <Col md={6}>
                  <h6 className="text-primary fw-bold mb-3">
                    <i className="bi bi-person me-2"></i>Personal Details
                  </h6>
                  <DetailRow
                    label="Date of Birth"
                    value={formatDateDDMMYYYY(viewCadet.dateOfBirth)}
                    icon="calendar-date"
                  />
                  <DetailRow
                    label="Father's Name"
                    value={viewCadet.fatherName}
                    icon="person-heart"
                  />
                  <DetailRow
                    label="Blood Group"
                    value={viewCadet.bloodGroup}
                    icon="droplet-fill"
                  />
                  <DetailRow
                    label="Phone"
                    value={viewCadet.phone}
                    icon="telephone"
                  />
                  <DetailRow
                    label="Email"
                    value={viewCadet.email}
                    icon="envelope"
                  />
                  <DetailRow
                    label="Address"
                    value={viewCadet.address}
                    icon="geo-alt"
                  />
                </Col>

                {/* Right column: Academic Details */}
                <Col md={6}>
                  <h6 className="text-primary fw-bold mb-3">
                    <i className="bi bi-book me-2"></i>Academic Details
                  </h6>
                  <DetailRow
                    label="Academic Year"
                    value={formatAcademicYear(viewCadet.year)}
                    icon="calendar3"
                  />
                  <DetailRow
                    label="Department"
                    value={viewCadet.department}
                    icon="building"
                  />
                  <DetailRow
                    label="Roll No."
                    value={viewCadet.rollNo}
                    icon="123"
                  />
                  <DetailRow
                    label="Register No."
                    value={viewCadet.registerNumber}
                    icon="card-text"
                  />
                  <DetailRow
                    label="Residential"
                    value={viewCadet.residentialStatus}
                    icon="house"
                  />
                </Col>
              </Row>

              <hr className="my-4" />

              <Row>
                <Col xs={12}>
                  <h6 className="text-primary fw-bold mb-3">
                    <i className="bi bi-shield me-2"></i>NCC Details
                  </h6>
                </Col>
                <Col md={6}>
                  <DetailRow
                    label="Regimental No."
                    value={viewCadet.regimentalNumber}
                    icon="hash"
                  />
                </Col>
                <Col md={6}>
                  <DetailRow
                    label="Date of Enrollment"
                    value={formatDateDDMMYYYY(viewCadet.dateOfEnrollment)}
                    icon="calendar-check"
                  />
                </Col>
              </Row>

              <hr />
              <div className="text-muted small text-end">
                <i className="bi bi-clock me-1"></i>
                Registered on:{" "}
                {new Date(viewCadet.createdAt).toLocaleDateString(
                  "en-GB",
                )}, {new Date(viewCadet.createdAt).toLocaleTimeString()}
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setViewCadet(null)}>
            Close
          </Button>
          <Button
            variant="outline-danger"
            onClick={() => {
              setViewCadet(null);
              if (viewCadet)
                setConfirm({ action: "reject", payload: viewCadet });
            }}
          >
            <i className="bi bi-x-circle me-1"></i>Reject
          </Button>
          <Button
            variant="success"
            disabled={!viewCadet?.emailVerified}
            title={
              !viewCadet?.emailVerified
                ? "Email not yet verified"
                : "Approve this registration"
            }
            onClick={() => {
              setViewCadet(null);
              if (viewCadet)
                setConfirm({ action: "approve", payload: viewCadet });
            }}
          >
            <i className="bi bi-check-circle me-1"></i>Accept
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default PendingTab;
