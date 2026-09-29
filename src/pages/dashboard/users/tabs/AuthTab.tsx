import { db, FIREBASE_CONFIG } from "@/shared/config/firebase";
import { useAuth } from "@/features/auth/AuthContext";
import { deleteApp, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  Modal,
  Row,
  Table,
} from "react-bootstrap";
import toast from "react-hot-toast";
import { triggerAuthCleanup } from "@/shared/utils/githubActions";
import { TablePaginationFooter } from "@/components";
import {
  ROMAN_YEAR_MAP,
  NCC_YEARS,
  BLOOD_GROUPS,
} from "@/shared/config/constants";
import { deleteTakenNumberBatch } from "@/shared/utils/dbValidators";

import { isAnoUser, resolveUserType } from "@/shared/utils/userType";
import { validatePassword } from "@/shared/utils/passwordPolicy";
import PasswordStrength from "@/components/common/PasswordStrength";
import type { ManagedUser } from "../types";
import "../UserManagement.css";

type UserData = ManagedUser;

interface AuthTabProps {
  users: ManagedUser[];
  onRefresh: () => Promise<void>;
  showAnoModal: boolean;
  setShowAnoModal: (show: boolean) => void;
}

const formatAcademicYear = (value?: string) => {
  if (!value) return "-";
  const cleaned = value.replace(" Year", "").trim();
  return ROMAN_YEAR_MAP[cleaned] || cleaned;
};

const AuthTab: React.FC<AuthTabProps> = ({ users, onRefresh, showAnoModal, setShowAnoModal }) => {
  const { currentUser, userProfile, isAdmin, isSuperAdmin } = useAuth();
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: "delete";
    payload: UserData;
  } | null>(null);

  // Filter states for users tab
  const [divisionFilterUsers, setDivisionFilterUsers] = useState<
    "ALL" | "SD" | "SW"
  >("ALL");
  const [searchTermUsers, setSearchTermUsers] = useState("");
  const [nccYearFilterUsers, setNccYearFilterUsers] = useState<"ALL" | string>(
    "ALL",
  );
  const [usersCurrentPage, setUsersCurrentPage] = useState(1);
  const [usersRowsPerPage, setUsersRowsPerPage] = useState(10);

  // ANO creation modal
  const [anoForm, setAnoForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    bloodGroup: "",
    rank: "",
  });
  const [anoErrors, setAnoErrors] = useState<Record<string, string>>({});

  const isSelf = (uid: string) => uid === currentUser?.uid;
  
  const canDeleteUser = (target: UserData) => {
    if (isSelf(target.uid)) return false;
    const targetIsAnoSuperadmin =
      isAnoUser(target) && target.role === "superadmin";
    const callerIsAnoSuperadmin = isAnoUser(userProfile) && isSuperAdmin();
    if (targetIsAnoSuperadmin && !callerIsAnoSuperadmin) return false;
    if (isSuperAdmin()) return true;
    if (isAdmin()) return target.role !== "superadmin";
    return false;
  };

  useEffect(() => {
    setUsersCurrentPage(1);
  }, [
    divisionFilterUsers,
    searchTermUsers,
    nccYearFilterUsers,
    usersRowsPerPage,
  ]);

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let list = [...users];

    if (divisionFilterUsers !== "ALL") {
      list = list.filter((u) => (u.division || "ALL") === divisionFilterUsers);
    }

    if (nccYearFilterUsers !== "ALL") {
      list = list.filter((u) => (u.nccYear || "") === nccYearFilterUsers);
    }

    if (searchTermUsers.trim()) {
      const term = searchTermUsers.toLowerCase();
      list = list.filter(
        (u) =>
          (u.regimentalNumber || "").toLowerCase().includes(term) ||
          (u.name || "").toLowerCase().includes(term),
      );
    }

    const NCC_YEAR_VAL: Record<string, number> = {
      "1st Year": 1,
      "2nd Year": 2,
      "3rd Year": 3,
    };
    const ROLE_VAL: Record<string, number> = {
      member: 1,
      admin: 2,
      superadmin: 3,
      alumni: 0,
    };

    list.sort((a, b) => {
      const groupA = isAnoUser(a) ? 2 : a.role === "alumni" ? 1 : 0;
      const groupB = isAnoUser(b) ? 2 : b.role === "alumni" ? 1 : 0;
      if (groupA !== groupB) return groupA - groupB;

      const yearA = NCC_YEAR_VAL[a.nccYear || ""] ?? 0;
      const yearB = NCC_YEAR_VAL[b.nccYear || ""] ?? 0;
      if (yearA !== yearB) return yearA - yearB;

      const regCmp = (a.regimentalNumber || "").localeCompare(
        b.regimentalNumber || "",
        undefined,
        { numeric: true },
      );
      if (regCmp !== 0) return regCmp;

      const roleA = ROLE_VAL[a.role] ?? 0;
      const roleB = ROLE_VAL[b.role] ?? 0;
      return roleA - roleB;
    });

    return list;
  }, [users, divisionFilterUsers, searchTermUsers, nccYearFilterUsers]);

  const usersTotalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / usersRowsPerPage),
  );
  const usersSafePage = Math.min(usersCurrentPage, usersTotalPages);
  const usersStartIndex = (usersSafePage - 1) * usersRowsPerPage;
  const usersEndIndex = Math.min(
    usersStartIndex + usersRowsPerPage,
    filteredUsers.length,
  );
  const paginatedUsers = filteredUsers.slice(usersStartIndex, usersEndIndex);

  const clearUsersFilters = () => {
    setDivisionFilterUsers("ALL");
    setSearchTermUsers("");
    setNccYearFilterUsers("ALL");
  };

  const handleDeleteUser = async (u: UserData) => {
    if (isSelf(u.uid)) {
      toast.error("You cannot delete your own account here");
      return;
    }
    if (!canDeleteUser(u)) {
      toast.error("You do not have permission to delete this user");
      return;
    }
    setSaving(true);
    try {
      const userType = resolveUserType(u);

      await deleteDoc(doc(db, "users", u.uid));

      if (userType === "cadet") {
        try {
          await deleteDoc(doc(db, "cadets", u.uid));
        } catch (_) {
          /* cadet doc may not exist */
        }

        const pendingSnapshot = await getDocs(
          query(collection(db, "pendingCadets")),
        );
        const matchingPending = pendingSnapshot.docs.find(
          (d) => d.data().email?.toLowerCase() === u.email.toLowerCase(),
        );
        if (matchingPending) {
          await deleteDoc(doc(db, "pendingCadets", matchingPending.id));
        }

        const batch = writeBatch(db);
        deleteTakenNumberBatch(batch, "regimentalNumber", u.regimentalNumber);
        deleteTakenNumberBatch(batch, "registerNumber", u.registerNumber);
        deleteTakenNumberBatch(batch, "rollNo", u.rollNo);
        await batch.commit();
      }

      await setDoc(doc(db, "pendingAuthDeletions", u.uid), {
        email: u.email,
        deletedBy: currentUser?.uid || "unknown",
        deletedAt: new Date().toISOString(),
      });

      triggerAuthCleanup();

      toast.success(
        userType === "ano"
          ? "ANO account deleted. Auth account will be cleaned up automatically."
          : "User completely deleted. Auth cleanup queued.",
      );
      await onRefresh();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  const validateAnoForm = () => {
    const errors: Record<string, string> = {};
    if (!anoForm.name.trim()) errors.name = "Name is required";
    if (!anoForm.email.trim()) errors.email = "Email is required";
    else if (!anoForm.email.includes("@"))
      errors.email = "Valid email is required";
    if (!anoForm.password) {
      errors.password = "Password is required";
    } else {
      const pwdResult = validatePassword(anoForm.password);
      if (!pwdResult.isValid) {
        errors.password = pwdResult.errors[0];
      }
    }
    if (!anoForm.phone.match(/^\d{10}$/))
      errors.phone = "Phone must be exactly 10 digits";
    if (!anoForm.bloodGroup) errors.bloodGroup = "Blood group is required";
    if (!anoForm.rank.trim()) errors.rank = "Rank is required";
    setAnoErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateAno = async () => {
    if (!validateAnoForm()) return;
    setSaving(true);
    try {
      const secondaryApp = initializeApp(
        FIREBASE_CONFIG,
        `SecondaryAno-${Date.now()}`,
      );
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        anoForm.email.trim(),
        anoForm.password,
      );
      const authUid = userCredential.user.uid;

      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      await setDoc(doc(db, "users", authUid), {
        name: anoForm.name.trim(),
        email: anoForm.email.trim(),
        phone: anoForm.phone.trim(),
        bloodGroup: anoForm.bloodGroup,
        rank: anoForm.rank.trim(),
        role: "superadmin",
        userType: "ano",
        status: "active",
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.uid || "unknown",
      });

      toast.success("ANO account created successfully");
      setShowAnoModal(false);
      setAnoForm({
        name: "",
        email: "",
        password: "",
        phone: "",
        bloodGroup: "",
        rank: "",
      });
      setAnoErrors({});
      await onRefresh();
    } catch (e: any) {
      console.error(e);
      if (e.code === "auth/email-already-in-use") {
        toast.error("This email is already registered");
      } else {
        toast.error(
          "Failed to create ANO account: " + (e.message || "Unknown error"),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const UsersTable = useMemo(
    () => (
      <>
        {/* Filter controls (Users) */}
        <Row className="mb-3 g-3">
          <Col xs={12} md={3}>
            <Form.Label className="small fw-semibold">Division</Form.Label>
            <div className="btn-group w-100" role="group">
              <input
                type="radio"
                className="btn-check"
                name="division-filter-users"
                id="division-users-all"
                checked={divisionFilterUsers === "ALL"}
                onChange={() => setDivisionFilterUsers("ALL")}
              />
              <label
                className="btn btn-outline-primary"
                htmlFor="division-users-all"
              >
                Both
              </label>

              <input
                type="radio"
                className="btn-check"
                name="division-filter-users"
                id="division-users-sd"
                checked={divisionFilterUsers === "SD"}
                onChange={() => setDivisionFilterUsers("SD")}
              />
              <label
                className="btn btn-outline-primary"
                htmlFor="division-users-sd"
              >
                SD
              </label>

              <input
                type="radio"
                className="btn-check"
                name="division-filter-users"
                id="division-users-sw"
                checked={divisionFilterUsers === "SW"}
                onChange={() => setDivisionFilterUsers("SW")}
              />
              <label
                className="btn btn-outline-primary"
                htmlFor="division-users-sw"
              >
                SW
              </label>
            </div>
          </Col>
          <Col xs={12} md={2}>
            <Form.Label className="small fw-semibold">NCC Year</Form.Label>
            <Form.Select
              value={nccYearFilterUsers}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setNccYearFilterUsers(e.target.value)
              }
            >
              <option value="ALL">All Years</option>
              {NCC_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col xs={12} md={3}>
            <Form.Label className="small fw-semibold">Search</Form.Label>
            <Form.Control
              type="text"
              placeholder="Search by name or regimental number..."
              value={searchTermUsers}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchTermUsers(e.target.value)
              }
            />
          </Col>
          <Col xs={12} md={2} className="d-flex align-items-end">
            <Button
              variant="outline-secondary"
              className="w-100"
              onClick={clearUsersFilters}
            >
              <i className="bi bi-x-circle me-1"></i>
              Clear Filters
            </Button>
          </Col>
        </Row>

        <Table striped bordered hover responsive className="user-mgmt-table">
          <thead>
            <tr>
              <th rowSpan={2}>S.No</th>
              <th rowSpan={2}>Name</th>
              <th rowSpan={2}>SD/SW</th>
              <th rowSpan={2}>Regimental Number</th>
              <th colSpan={2} className="year-header">
                Year
              </th>
              <th rowSpan={2}>Email</th>
              <th rowSpan={2}>Actions</th>
            </tr>
            <tr>
              <th>NCC</th>
              <th>Academic</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.map((u, index) => (
              <tr key={u.uid}>
                <td>{usersStartIndex + index + 1}</td>
                <td className="col-left" dir="ltr">
                  {u.name || "N/A"}{" "}
                  {isSelf(u.uid) && (
                    <Badge bg="success" className="ms-1">
                      You
                    </Badge>
                  )}
                  {u.role === "alumni" && (
                    <Badge bg="secondary" className="ms-1">
                      Alumni
                    </Badge>
                  )}
                  {isAnoUser(u) && (
                    <Badge bg="dark" className="ms-1">
                      ANO
                    </Badge>
                  )}
                </td>
                <td>
                  {u.division ? (
                    <Badge bg={u.division === "SD" ? "info" : "warning"}>
                      {u.division}
                    </Badge>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td>{u.regimentalNumber || "-"}</td>
                <td>
                  {u.role === "alumni" ? (
                    <span className="text-success small fw-bold">
                      <i className="bi bi-check-circle-fill me-1"></i>Completed
                    </span>
                  ) : (
                    formatAcademicYear(u.nccYear)
                  )}
                </td>
                <td>{formatAcademicYear(u.year)}</td>
                <td className="col-left">{u.email}</td>
                <td className="d-flex gap-2">
                  {!isSelf(u.uid) ? (
                    <>
                      {canDeleteUser(u) && u.role !== "alumni" ? (
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() =>
                            setConfirm({ action: "delete", payload: u })
                          }
                        >
                          Delete
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline-secondary" disabled>
                          Delete
                        </Button>
                      )}
                    </>
                  ) : (
                    <small className="text-muted">Self-managed</small>
                  )}
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted">
                  No users match filters
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        <TablePaginationFooter
          totalItems={filteredUsers.length}
          currentPage={usersSafePage}
          rowsPerPage={usersRowsPerPage}
          onRowsPerPageChange={setUsersRowsPerPage}
          onFirstPage={() => setUsersCurrentPage(1)}
          onPreviousPage={() =>
            setUsersCurrentPage((page) => Math.max(1, page - 1))
          }
          onNextPage={() =>
            setUsersCurrentPage((page) => Math.min(usersTotalPages, page + 1))
          }
          onLastPage={() => setUsersCurrentPage(usersTotalPages)}
        />
      </>
    ),
    [
      filteredUsers,
      paginatedUsers,
      usersSafePage,
      usersRowsPerPage,
      usersStartIndex,
      usersTotalPages,
      userProfile,
      nccYearFilterUsers,
      divisionFilterUsers,
      searchTermUsers,
    ],
  );

  return (
    <>
      <div className="mb-3">
        <Alert variant="info" className="mb-2">
          View or delete users. On Firebase Spark plan, deletion removes
          user data from Firestore only.
        </Alert>
        <Alert variant="warning" className="mb-0">
          Firebase Authentication account deletion requires a privileged
          backend (Cloud Functions/Admin SDK), which is not available on
          Spark plan.
        </Alert>
      </div>

      {UsersTable}

      {/* Confirm modal for delete */}
      <Modal show={!!confirm} onHide={() => setConfirm(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {confirm?.action === "delete" && (
            <p>
              Delete user <strong>{confirm?.payload?.name}</strong> (
              {confirm?.payload?.email})? This cannot be undone.
            </p>
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
          {confirm?.action === "delete" && (
            <Button
              variant="danger"
              onClick={() => handleDeleteUser(confirm.payload)}
              disabled={saving}
            >
              Delete
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      {/* ANO Creation Modal */}
      <Modal show={showAnoModal} onHide={() => setShowAnoModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Create ANO Account</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Name *</Form.Label>
              <Form.Control
                value={anoForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAnoForm((f) => ({ ...f, name: e.target.value }))
                }
                isInvalid={Boolean(anoErrors.name)}
              />
              {anoErrors.name && (
                <Form.Text className="text-danger">{anoErrors.name}</Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email *</Form.Label>
              <Form.Control
                type="email"
                value={anoForm.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAnoForm((f) => ({ ...f, email: e.target.value }))
                }
                isInvalid={Boolean(anoErrors.email)}
              />
              {anoErrors.email && (
                <Form.Text className="text-danger">{anoErrors.email}</Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password *</Form.Label>
              <Form.Control
                type="password"
                value={anoForm.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAnoForm((f) => ({ ...f, password: e.target.value }))
                }
                isInvalid={Boolean(anoErrors.password)}
                placeholder="Min 8 chars, A-z, 0-9, special"
              />
              <PasswordStrength password={anoForm.password} />
              {anoErrors.password && (
                <Form.Text className="text-danger">
                  {anoErrors.password}
                </Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Phone *</Form.Label>
              <Form.Control
                value={anoForm.phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAnoForm((f) => ({ ...f, phone: e.target.value }))
                }
                isInvalid={Boolean(anoErrors.phone)}
              />
              {anoErrors.phone && (
                <Form.Text className="text-danger">{anoErrors.phone}</Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Blood Group *</Form.Label>
              <Form.Select
                value={anoForm.bloodGroup}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setAnoForm((f) => ({ ...f, bloodGroup: e.target.value }))
                }
                isInvalid={Boolean(anoErrors.bloodGroup)}
              >
                <option value="">Select</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </Form.Select>
              {anoErrors.bloodGroup && (
                <Form.Text className="text-danger">
                  {anoErrors.bloodGroup}
                </Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Rank *</Form.Label>
              <Form.Control
                value={anoForm.rank}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAnoForm((f) => ({ ...f, rank: e.target.value }))
                }
                isInvalid={Boolean(anoErrors.rank)}
                placeholder="e.g., Major, Captain"
              />
              {anoErrors.rank && (
                <Form.Text className="text-danger">{anoErrors.rank}</Form.Text>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowAnoModal(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleCreateAno} disabled={saving}>
            {saving ? "Creating..." : "Create ANO"}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default AuthTab;
