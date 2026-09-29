import {
  calculateAge,
  checkUniqueField,
  updateTakenNumberBatch,
} from "@/shared/utils/dbValidators";
import { formatISTDate } from "@/shared/utils/dateTime";
import {
  DEPARTMENT_DEFS,
  ACADEMIC_YEARS,
  ROMAN_YEAR_MAP,
  NCC_RANKS,
  NCC_YEARS,
  BLOOD_GROUPS,
} from "@/shared/config/constants";
import { db } from "@/shared/config/firebase";
import { doc, writeBatch } from "firebase/firestore";
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
import { TablePaginationFooter } from "@/components";
import type { ManagedUser } from "../types";
import "../UserManagement.css";

const maxDobDate = new Date();
maxDobDate.setFullYear(maxDobDate.getFullYear() - 17);
const maxDobString = maxDobDate.toISOString().split("T")[0];

interface CadetDirectoryTabProps {
  users: ManagedUser[];
  onUsersChange: React.Dispatch<React.SetStateAction<ManagedUser[]>>;
}

const CadetDirectoryTab: React.FC<CadetDirectoryTabProps> = ({
  users,
  onUsersChange,
}) => {
  const [saving, setSaving] = useState(false);
  const [cadetView, setCadetView] = useState<ManagedUser | null>(null);
  const [cadetEditMode, setCadetEditMode] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [divisionFilter, setDivisionFilter] = useState<"ALL" | "SD" | "SW">(
    "ALL",
  );
  const [nccYearFilter, setNccYearFilter] = useState<"ALL" | string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [cadetEditForm, setCadetEditForm] = useState({
    name: "",
    dateOfBirth: "",
    division: "",
    regimentalNumber: "",
    dateOfEnrollment: "",
    nccYear: "",
    rank: "CDT",
    year: "",
    residentialStatus: "",
    department: "",
    rollNo: "",
    registerNumber: "",
    phone: "",
    bloodGroup: "",
    fatherName: "",
    address: "",
  });
  const [cadetEditErrors, setCadetEditErrors] = useState<
    Record<string, string>
  >({});

  const editAcademicYearOptions = useMemo(() => {
    const fiveYearDepartments = new Set<string>(
      DEPARTMENT_DEFS.filter((d) => d.courseTenure === 5).map((d) => d.code),
    );
    return fiveYearDepartments.has(cadetEditForm.department)
      ? ACADEMIC_YEARS
      : ACADEMIC_YEARS.filter((y) => y !== "5th Year");
  }, [cadetEditForm.department]);

  useEffect(() => {
    setCurrentPage(1);
  }, [divisionFilter, nccYearFilter, searchTerm, rowsPerPage]);

  const cadetUsers = useMemo(() => {
    let list = users.filter(
      (u) => u.role === "member" && (!u.userType || u.userType === "cadet"),
    );

    if (divisionFilter !== "ALL") {
      list = list.filter((u) => (u.division || "") === divisionFilter);
    }

    if (nccYearFilter !== "ALL") {
      list = list.filter((u) => (u.nccYear || "") === nccYearFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (u) =>
          (u.regimentalNumber || "").toLowerCase().includes(term) ||
          (u.name || "").toLowerCase().includes(term),
      );
    }

    const getNccYearRank = (value?: string) => {
      if (!value) return Number.MAX_SAFE_INTEGER;
      const match = value.match(/(\d+)/);
      return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
    };

    list.sort((left, right) => {
      const yearDifference =
        getNccYearRank(left.nccYear) - getNccYearRank(right.nccYear);
      if (yearDifference !== 0) return yearDifference;

      return (left.regimentalNumber || "").localeCompare(
        right.regimentalNumber || "",
        undefined,
        { numeric: true },
      );
    });

    return list;
  }, [users, divisionFilter, nccYearFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(cadetUsers.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, cadetUsers.length);
  const paginatedCadets = cadetUsers.slice(startIndex, endIndex);

  const clearFilters = () => {
    setDivisionFilter("ALL");
    setNccYearFilter("ALL");
    setSearchTerm("");
  };

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "-" : formatISTDate(d);
  };

  const formatYear = (value?: string) => {
    if (!value) return "-";
    const cleaned = value.replace(" Year", "").trim();
    return ROMAN_YEAR_MAP[cleaned] || cleaned;
  };

  const getRankName = (code?: string) => {
    if (!code) return "Cadet";
    return NCC_RANKS.find((r) => r.code === code)?.name || code;
  };

  const openCadetView = (u: ManagedUser) => {
    setCadetView(u);
    setCadetEditMode(false);
    setConfirmSave(false);
    setCadetEditErrors({});
    setCadetEditForm({
      name: u.name || "",
      dateOfBirth: u.dateOfBirth || "",
      division: u.division || "",
      regimentalNumber: u.regimentalNumber || "",
      dateOfEnrollment: u.dateOfEnrollment || "",
      nccYear: u.nccYear || "1st Year",
      rank: u.rank || "CDT",
      year: u.year || "1st Year",
      residentialStatus: u.residentialStatus || "",
      department: u.department || "",
      rollNo: u.rollNo || "",
      registerNumber: u.registerNumber || "",
      phone: u.phone || "",
      bloodGroup: u.bloodGroup || "",
      fatherName: u.fatherName || "",
      address: u.address || "",
    });
  };

  const closeCadetView = () => {
    setCadetView(null);
    setCadetEditMode(false);
  };

  const handleCadetEditChange = (name: string, value: string) => {
    if (cadetEditErrors[name]) {
      setCadetEditErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    setCadetEditForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "department") {
        const dept = DEPARTMENT_DEFS.find((d) => d.code === value);
        if (dept && dept.courseTenure !== 5 && prev.year === "5th Year") {
          next.year = "4th Year";
        }
      }
      return next;
    });
  };

  const validateCadetEdit = () => {
    const nextErrors: Record<string, string> = {};

    if (!cadetEditForm.name.trim()) nextErrors.name = "Name is required";
    if (!cadetEditForm.dateOfBirth) {
      nextErrors.dateOfBirth = "Date of birth is required";
    } else {
      const age = calculateAge(cadetEditForm.dateOfBirth);
      if (age < 17) {
        nextErrors.dateOfBirth = "Cadets must be at least 17 years old";
      }
    }
    if (!cadetEditForm.division) nextErrors.division = "Division is required";
    if (!cadetEditForm.regimentalNumber.trim())
      nextErrors.regimentalNumber = "Regimental number is required";
    if (!cadetEditForm.dateOfEnrollment)
      nextErrors.dateOfEnrollment = "Date of enrollment is required";
    if (!cadetEditForm.nccYear) nextErrors.nccYear = "Year is required";
    if (!cadetEditForm.rank) nextErrors.rank = "Rank is required";
    if (!cadetEditForm.year) nextErrors.year = "Academic year is required";
    if (!cadetEditForm.residentialStatus)
      nextErrors.residentialStatus = "Residential status is required";
    if (!cadetEditForm.department)
      nextErrors.department = "Department is required";
    if (!cadetEditForm.rollNo.trim())
      nextErrors.rollNo = "Roll number is required";
    if (!cadetEditForm.registerNumber.trim()) {
      nextErrors.registerNumber = "Register number is required";
    } else if (!cadetEditForm.registerNumber.match(/^\d{16}$/)) {
      nextErrors.registerNumber = "Register number must be exactly 16 digits";
    }
    if (!cadetEditForm.phone.trim()) {
      nextErrors.phone = "Phone number is required";
    } else if (cadetEditForm.phone.match(/^\d{10}$/) === null) {
      nextErrors.phone = "Phone number must be exactly 10 digits";
    }
    if (!cadetEditForm.bloodGroup.trim())
      nextErrors.bloodGroup = "Blood group is required";

    setCadetEditErrors(nextErrors);
    const isValid = Object.keys(nextErrors).length === 0;
    if (!isValid) {
      setTimeout(() => {
        document
          .querySelector(".is-invalid")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
    return isValid;
  };

  const requestSave = () => {
    if (!validateCadetEdit()) return;
    setConfirmSave(true);
  };

  const handleUpdateCadet = async () => {
    if (!cadetView) return;
    if (!validateCadetEdit()) return;
    setSaving(true);
    try {
      const [isRegimentalUnique, isRegisterUnique, isRollUnique] =
        await Promise.all([
          checkUniqueField(
            "regimentalNumber",
            cadetEditForm.regimentalNumber,
            cadetView.uid,
          ),
          checkUniqueField(
            "registerNumber",
            cadetEditForm.registerNumber,
            cadetView.uid,
          ),
          checkUniqueField("rollNo", cadetEditForm.rollNo, cadetView.uid),
        ]);

      const uniqueErrors: Record<string, string> = {};
      if (!isRegimentalUnique)
        uniqueErrors.regimentalNumber =
          "This Regimental Number is already in use";
      if (!isRegisterUnique)
        uniqueErrors.registerNumber = "This Register Number is already in use";
      if (!isRollUnique)
        uniqueErrors.rollNo = "This Roll Number is already in use";

      if (Object.keys(uniqueErrors).length > 0) {
        setCadetEditErrors((prev) => ({ ...prev, ...uniqueErrors }));
        toast.error("One or more identification numbers are already in use");
        setTimeout(() => {
          document
            .querySelector(".is-invalid")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
        setSaving(false);
        setConfirmSave(false);
        return;
      }

      const batch = writeBatch(db);
      const userRef = doc(db, "users", cadetView.uid);

      batch.update(userRef, {
        name: cadetEditForm.name,
        dateOfBirth: cadetEditForm.dateOfBirth,
        division: cadetView.division,
        regimentalNumber: cadetEditForm.regimentalNumber,
        dateOfEnrollment: cadetEditForm.dateOfEnrollment,
        nccYear: cadetEditForm.nccYear,
        rank: cadetEditForm.rank,
        year: cadetEditForm.year,
        residentialStatus: cadetEditForm.residentialStatus,
        department: cadetEditForm.department,
        rollNo: cadetEditForm.rollNo,
        registerNumber: cadetEditForm.registerNumber,
        phone: cadetEditForm.phone,
        bloodGroup: cadetEditForm.bloodGroup,
        fatherName: cadetEditForm.fatherName,
        address: cadetEditForm.address,
        lastUpdated: new Date().toISOString(),
      });

      updateTakenNumberBatch(
        batch,
        "regimentalNumber",
        cadetView.regimentalNumber,
        cadetEditForm.regimentalNumber,
        cadetView.uid,
      );
      updateTakenNumberBatch(
        batch,
        "registerNumber",
        cadetView.registerNumber,
        cadetEditForm.registerNumber,
        cadetView.uid,
      );
      updateTakenNumberBatch(
        batch,
        "rollNo",
        cadetView.rollNo,
        cadetEditForm.rollNo,
        cadetView.uid,
      );

      await batch.commit();

      // Update the parent's user list via props
      onUsersChange((prev) =>
        prev.map((u) =>
          u.uid === cadetView.uid
            ? {
                ...u,
                name: cadetEditForm.name,
                dateOfBirth: cadetEditForm.dateOfBirth,
                division: cadetView.division,
                regimentalNumber: cadetEditForm.regimentalNumber,
                dateOfEnrollment: cadetEditForm.dateOfEnrollment,
                nccYear: cadetEditForm.nccYear,
                rank: cadetEditForm.rank,
                year: cadetEditForm.year,
                residentialStatus: cadetEditForm.residentialStatus,
                department: cadetEditForm.department,
                rollNo: cadetEditForm.rollNo,
                registerNumber: cadetEditForm.registerNumber,
                phone: cadetEditForm.phone,
                bloodGroup: cadetEditForm.bloodGroup,
                fatherName: cadetEditForm.fatherName,
                address: cadetEditForm.address,
              }
            : u,
        ),
      );

      setCadetView((prev) =>
        prev
          ? {
              ...prev,
              name: cadetEditForm.name,
              dateOfBirth: cadetEditForm.dateOfBirth,
              division: cadetView.division,
              regimentalNumber: cadetEditForm.regimentalNumber,
              dateOfEnrollment: cadetEditForm.dateOfEnrollment,
              nccYear: cadetEditForm.nccYear,
              rank: cadetEditForm.rank,
              year: cadetEditForm.year,
              residentialStatus: cadetEditForm.residentialStatus,
              department: cadetEditForm.department,
              rollNo: cadetEditForm.rollNo,
              registerNumber: cadetEditForm.registerNumber,
              phone: cadetEditForm.phone,
              bloodGroup: cadetEditForm.bloodGroup,
              fatherName: cadetEditForm.fatherName,
              address: cadetEditForm.address,
            }
          : prev,
      );

      toast.success("Cadet profile updated");
      setCadetEditMode(false);
      setConfirmSave(false);
    } catch (e) {
      console.error(e);
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Alert variant="info">
        View member profiles. Admins and super admins can edit the full
        cadet record from the profile view.
      </Alert>
      <Row className="mb-3 g-3">
        <Col xs={12} md={3}>
          <Form.Label className="small fw-semibold">Division</Form.Label>
          <div className="btn-group w-100" role="group">
            <input
              type="radio"
              className="btn-check"
              name="division-filter-cadets"
              id="division-cadets-all"
              checked={divisionFilter === "ALL"}
              onChange={() => setDivisionFilter("ALL")}
            />
            <label
              className="btn btn-outline-primary"
              htmlFor="division-cadets-all"
            >
              Both
            </label>

            <input
              type="radio"
              className="btn-check"
              name="division-filter-cadets"
              id="division-cadets-sd"
              checked={divisionFilter === "SD"}
              onChange={() => setDivisionFilter("SD")}
            />
            <label
              className="btn btn-outline-primary"
              htmlFor="division-cadets-sd"
            >
              SD
            </label>

            <input
              type="radio"
              className="btn-check"
              name="division-filter-cadets"
              id="division-cadets-sw"
              checked={divisionFilter === "SW"}
              onChange={() => setDivisionFilter("SW")}
            />
            <label
              className="btn btn-outline-primary"
              htmlFor="division-cadets-sw"
            >
              SW
            </label>
          </div>
        </Col>
        <Col xs={12} md={3}>
          <Form.Label className="small fw-semibold">Year</Form.Label>
          <Form.Select
            value={nccYearFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setNccYearFilter(e.target.value)
            }
          >
            <option value="" disabled>
              Select NCC Year
            </option>
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
            <th rowSpan={2}>Actions</th>
          </tr>
          <tr>
            <th>NCC</th>
            <th>Academic</th>
          </tr>
        </thead>
        <tbody>
          {paginatedCadets.map((u, index) => (
            <tr key={u.uid}>
              <td>{startIndex + index + 1}</td>
              <td className="col-left" dir="ltr">
                {u.name || "N/A"}
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
              <td>{formatYear(u.nccYear)}</td>
              <td>{formatYear(u.year)}</td>
              <td>
                <Button
                  size="sm"
                  variant="outline-primary"
                  className="rounded-circle d-inline-flex align-items-center justify-content-center"
                  onClick={() => openCadetView(u)}
                  aria-label={`View ${u.name || "cadet"} profile`}
                  title="View profile"
                >
                  <i className="bi bi-eye-fill"></i>
                </Button>
              </td>
            </tr>
          ))}
          {cadetUsers.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-muted">
                No cadets found
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <TablePaginationFooter
        totalItems={cadetUsers.length}
        currentPage={safePage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={setRowsPerPage}
        onFirstPage={() => setCurrentPage(1)}
        onPreviousPage={() =>
          setCurrentPage((page) => Math.max(1, page - 1))
        }
        onNextPage={() =>
          setCurrentPage((page) => Math.min(totalPages, page + 1))
        }
        onLastPage={() => setCurrentPage(totalPages)}
      />

      <Modal show={!!cadetView} onHide={closeCadetView} centered size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            {cadetEditMode ? "Edit Cadet Profile" : "Cadet Profile"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!cadetEditMode && cadetView && (
            <>
              <h6 className="text-primary mb-2">Personal</h6>
              <Row className="g-3 mb-3">
                <Col xs={12} md={6}>
                  <Form.Label className="fw-bold text-muted small">
                    Name
                  </Form.Label>
                  <p className="mb-0">{cadetView.name || "-"}</p>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Label className="fw-bold text-muted small">
                    Email
                  </Form.Label>
                  <p className="mb-0">{cadetView.email || "-"}</p>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Label className="fw-bold text-muted small">
                    Date of Birth
                  </Form.Label>
                  <p className="mb-0">{formatDate(cadetView.dateOfBirth)}</p>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Label className="fw-bold text-muted small">
                    Role
                  </Form.Label>
                  <p className="mb-0">{cadetView.role}</p>
                </Col>
              </Row>

              <hr />

              <h6 className="text-primary mb-2">NCC</h6>
              <Row className="g-3 mb-3">
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Division
                  </Form.Label>
                  <p className="mb-0">{cadetView.division || "-"}</p>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Rank
                  </Form.Label>
                  <p className="mb-0">{getRankName(cadetView.rank || "CDT")}</p>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Regimental Number
                  </Form.Label>
                  <p className="mb-0">{cadetView.regimentalNumber || "-"}</p>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Year
                  </Form.Label>
                  <p className="mb-0">
                    {formatYear(cadetView.nccYear || "1st Year")}
                  </p>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Date of Enrollment
                  </Form.Label>
                  <p className="mb-0">
                    {formatDate(cadetView.dateOfEnrollment)}
                  </p>
                </Col>
              </Row>

              <hr />

              <h6 className="text-primary mb-2">Academic</h6>
              <Row className="g-3 mb-3">
                <Col xs={12} md={3}>
                  <Form.Label className="fw-bold text-muted small">
                    Year
                  </Form.Label>
                  <p className="mb-0">
                    {formatYear(cadetView.year || "1st Year")}
                  </p>
                </Col>
                <Col xs={12} md={3}>
                  <Form.Label className="fw-bold text-muted small">
                    Department
                  </Form.Label>
                  <p className="mb-0">{cadetView.department || "-"}</p>
                </Col>
                <Col xs={12} md={3}>
                  <Form.Label className="fw-bold text-muted small">
                    Roll Number
                  </Form.Label>
                  <p className="mb-0">{cadetView.rollNo || "-"}</p>
                </Col>
              </Row>
              <Row className="g-3 mb-3">
                <Col xs={12} md={3}>
                  <Form.Label className="fw-bold text-muted small">
                    Register Number
                  </Form.Label>
                  <p className="mb-0">{cadetView.registerNumber || "-"}</p>
                </Col>
              </Row>

              <hr />

              <h6 className="text-primary mb-2">Additional</h6>
              <Row className="g-3">
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Phone
                  </Form.Label>
                  <p className="mb-0">{cadetView.phone || "-"}</p>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Blood Group
                  </Form.Label>
                  <p className="mb-0">{cadetView.bloodGroup || "-"}</p>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Label className="fw-bold text-muted small">
                    Father's / Guardian's Name
                  </Form.Label>
                  <p className="mb-0">{cadetView.fatherName || "-"}</p>
                </Col>
                <Col xs={12} md={12}>
                  <Form.Label className="fw-bold text-muted small">
                    Address
                  </Form.Label>
                  <p className="mb-0">{cadetView.address || "-"}</p>
                </Col>
              </Row>
            </>
          )}

          {cadetEditMode && (
            <Form>
              <h6 className="text-primary mb-2">Personal</h6>
              <Row className="g-3 mb-3">
                <Col xs={12} md={6}>
                  <Form.Group controlId="editCadetName">
                    <Form.Label>Name *</Form.Label>
                    <Form.Control
                      type="text"
                      value={cadetEditForm.name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange("name", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.name)}
                    />
                    {cadetEditErrors.name && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.name}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Group controlId="editCadetDob">
                    <Form.Label>Date of Birth</Form.Label>
                    <Form.Control
                      type="date"
                      value={cadetEditForm.dateOfBirth}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange("dateOfBirth", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.dateOfBirth)}
                      max={maxDobString}
                    />
                    {cadetEditErrors.dateOfBirth && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.dateOfBirth}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Group controlId="editCadetEmail">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      type="text"
                      value={cadetView?.email || ""}
                      readOnly
                      plaintext
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Group controlId="editCadetRole">
                    <Form.Label>Role</Form.Label>
                    <Form.Control
                      type="text"
                      value={cadetView?.role || ""}
                      readOnly
                      plaintext
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Group controlId="editCadetDivision">
                    <Form.Label>Division *</Form.Label>
                    <Form.Control
                      type="text"
                      value={cadetView?.division || ""}
                      readOnly
                      plaintext
                    />
                    {cadetEditErrors.division && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.division}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
              </Row>

              <hr />

              <h6 className="text-primary mb-2">NCC</h6>
              <Row className="g-3 mb-3">
                <Col xs={12} md={4}>
                  <Form.Group controlId="editCadetRank">
                    <Form.Label>Rank *</Form.Label>
                    <Form.Select
                      value={cadetEditForm.rank}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleCadetEditChange("rank", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.rank)}
                    >
                      <option value="" disabled>
                        Select Rank
                      </option>
                      {NCC_RANKS.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </Form.Select>
                    {cadetEditErrors.rank && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.rank}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Group controlId="editCadetRegimental">
                    <Form.Label>Regimental Number *</Form.Label>
                    <Form.Control
                      type="text"
                      value={cadetEditForm.regimentalNumber}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange(
                          "regimentalNumber",
                          e.target.value,
                        )
                      }
                      isInvalid={Boolean(cadetEditErrors.regimentalNumber)}
                    />
                    {cadetEditErrors.regimentalNumber && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.regimentalNumber}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Group controlId="editCadetNccYear">
                    <Form.Label>Year *</Form.Label>
                    <Form.Select
                      value={cadetEditForm.nccYear}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleCadetEditChange("nccYear", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.nccYear)}
                    >
                      <option value="" disabled>
                        Select Year
                      </option>
                      {NCC_YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Form.Select>
                    {cadetEditErrors.nccYear && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.nccYear}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Group controlId="editCadetEnrollment">
                    <Form.Label>Date of Enrollment *</Form.Label>
                    <Form.Control
                      type="date"
                      value={cadetEditForm.dateOfEnrollment}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange(
                          "dateOfEnrollment",
                          e.target.value,
                        )
                      }
                      isInvalid={Boolean(cadetEditErrors.dateOfEnrollment)}
                    />
                    {cadetEditErrors.dateOfEnrollment && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.dateOfEnrollment}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
              </Row>

              <hr />

              <h6 className="text-primary mb-2">Academic</h6>
              <Row className="g-3 mb-3">
                <Col xs={12} md={3}>
                  <Form.Group controlId="editCadetAcademicYear">
                    <Form.Label>Year *</Form.Label>
                    <Form.Select
                      value={cadetEditForm.year}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleCadetEditChange("year", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.year)}
                    >
                      <option value="" disabled>
                        Select Year
                      </option>
                      {editAcademicYearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Form.Select>
                    {cadetEditErrors.year && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.year}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={3}>
                  <Form.Group controlId="editCadetDepartment">
                    <Form.Label>Department *</Form.Label>
                    <Form.Select
                      value={cadetEditForm.department}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleCadetEditChange("department", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.department)}
                    >
                      <option value="" disabled>
                        Select Department
                      </option>
                      {DEPARTMENT_DEFS.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code}
                        </option>
                      ))}
                    </Form.Select>
                    {cadetEditErrors.department && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.department}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={3}>
                  <Form.Group controlId="editCadetRoll">
                    <Form.Label>Roll Number *</Form.Label>
                    <Form.Control
                      type="text"
                      value={cadetEditForm.rollNo}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange("rollNo", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.rollNo)}
                    />
                    {cadetEditErrors.rollNo && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.rollNo}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={3}>
                  <Form.Group controlId="editCadetRegister">
                    <Form.Label>Register Number *</Form.Label>
                    <Form.Control
                      type="number"
                      value={cadetEditForm.registerNumber}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange("registerNumber", e.target.value)
                      }
                      onWheel={(e: React.WheelEvent<HTMLInputElement>) =>
                        e.currentTarget.blur()
                      }
                      min="0"
                      isInvalid={Boolean(cadetEditErrors.registerNumber)}
                    />
                    {cadetEditErrors.registerNumber && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.registerNumber}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
              </Row>

              <hr />

              <h6 className="text-primary mb-2">Additional</h6>
              <Row className="g-3">
                <Col xs={12} md={4}>
                  <Form.Group controlId="editCadetResidentialStatus">
                    <Form.Label>Residential Status *</Form.Label>
                    <Form.Select
                      value={cadetEditForm.residentialStatus}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleCadetEditChange(
                          "residentialStatus",
                          e.target.value,
                        )
                      }
                      isInvalid={Boolean(cadetEditErrors.residentialStatus)}
                    >
                      <option value="" disabled>
                        Select Status
                      </option>
                      <option value="Day Scholar">Day Scholar</option>
                      <option value="Hosteller">Hosteller</option>
                    </Form.Select>
                    {cadetEditErrors.residentialStatus && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.residentialStatus}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Group controlId="editCadetPhone">
                    <Form.Label>Phone</Form.Label>
                    <Form.Control
                      type="tel"
                      value={cadetEditForm.phone}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange("phone", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.phone)}
                    />
                    {cadetEditErrors.phone && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.phone}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Group controlId="editCadetBloodGroup">
                    <Form.Label>Blood Group</Form.Label>
                    <Form.Select
                      value={cadetEditForm.bloodGroup}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        handleCadetEditChange("bloodGroup", e.target.value)
                      }
                      isInvalid={Boolean(cadetEditErrors.bloodGroup)}
                    >
                      <option value="">Select Blood Group</option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </Form.Select>
                    {cadetEditErrors.bloodGroup && (
                      <Form.Text className="text-danger">
                        {cadetEditErrors.bloodGroup}
                      </Form.Text>
                    )}
                  </Form.Group>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Group controlId="editCadetFatherName">
                    <Form.Label>Father's / Guardian's Name</Form.Label>
                    <Form.Control
                      type="text"
                      value={cadetEditForm.fatherName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        handleCadetEditChange("fatherName", e.target.value)
                      }
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} md={12}>
                  <Form.Group controlId="editCadetAddress">
                    <Form.Label>Address</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      value={cadetEditForm.address}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        handleCadetEditChange("address", e.target.value)
                      }
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={closeCadetView}
            disabled={saving}
          >
            Close
          </Button>
          {!cadetEditMode && (
            <Button variant="primary" onClick={() => setCadetEditMode(true)}>
              Edit
            </Button>
          )}
          {cadetEditMode && (
            <>
              <Button
                variant="outline-secondary"
                onClick={() => setCadetEditMode(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={requestSave} disabled={saving}>
                Save
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      <Modal show={confirmSave} onHide={() => setConfirmSave(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Save</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Save profile changes for <strong>{cadetView?.name}</strong>?
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setConfirmSave(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpdateCadet}
            disabled={saving}
          >
            Save
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default CadetDirectoryTab;
