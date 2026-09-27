import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import { AnimatedSection } from "../../components";
import { db } from "../../shared/config/firebase";
import { useAuth } from "@/features/auth/AuthContext";
import {
  listAnnouncementsForUser,
  getUserReadIds,
} from "@/features/announcements/service";
import "./DashboardHome.css";

const Dashboard: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingAlumniCount, setPendingAlumniCount] = useState(0);
  const [eligibleDriveCount, setEligibleDriveCount] = useState(0);
  const isAdmin = userProfile?.role === "admin";
  const isSuperAdmin = userProfile?.role === "superadmin";

  useEffect(() => {
    const fetchPendingCount = async () => {
      if (isAdmin || isSuperAdmin) {
        try {
          const [pendingSnap, usersSnap] = await Promise.all([
            getDocs(query(collection(db, "pendingCadets"))),
            getDocs(query(collection(db, "users"))),
          ]);

          const existingEmails = new Set(
            usersSnap.docs.map((d) => d.data().email?.toLowerCase()),
          );
          const actualPending = pendingSnap.docs.filter(
            (d) => !existingEmails.has(d.data().email?.toLowerCase()),
          ).length;

          setPendingCount(actualPending);
        } catch (error) {
          console.error("Failed to fetch pending count:", error);
        }
      }
    };

    fetchPendingCount();
  }, [isAdmin, isSuperAdmin]);

  // Fetch unread announcement count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (!currentUser?.uid) return;
      try {
        const [announcements, readIds] = await Promise.all([
          listAnnouncementsForUser(),
          getUserReadIds(currentUser.uid),
        ]);
        const unread = announcements.filter((a) => {
          if (!a.id || readIds.has(a.id)) return false;
          // Admins: exclude own announcements from unread count
          if ((isAdmin || isSuperAdmin) && a.createdBy === currentUser.uid)
            return false;
          return true;
        }).length;
        setUnreadCount(unread);
      } catch (error) {
        console.error("Failed to fetch unread count:", error);
      }
    };

    fetchUnreadCount();
  }, [currentUser?.uid, isAdmin, isSuperAdmin]);

  // Fetch pending alumni count for super admins
  useEffect(() => {
    const fetchPendingAlumniCount = async () => {
      if (!isSuperAdmin) return;
      try {
        const snap = await getDocs(
          query(
            collection(db, "alumniProfiles"),
            where("status", "==", "pending"),
          ),
        );
        setPendingAlumniCount(snap.size);
      } catch (error) {
        console.error("Failed to fetch pending alumni count:", error);
      }
    };
    fetchPendingAlumniCount();
  }, [isSuperAdmin]);

  // Fetch eligible event drive count for cadets
  useEffect(() => {
    const fetchEligibleDriveCount = async () => {
      if (!currentUser?.uid || !userProfile) return;
      const profileData = userProfile as unknown as {
        division?: string;
        nccYear?: string;
        [key: string]: unknown;
      };
      const userDivision = profileData?.division;
      const userNccYear = profileData?.nccYear;
      if (!userDivision || !userNccYear) return;
      try {
        const snap = await getDocs(
          query(
            collection(db, "eventDrives"),
            where("status", "==", "open"),
            where("targetDivision", "==", userDivision),
            where("targetNccYear", "==", userNccYear),
          ),
        );
        // Only count drives whose deadline hasn't passed
        const now = new Date();
        const active = snap.docs.filter((d) => {
          const deadline = d.data().deadline;
          return deadline && new Date(deadline) > now;
        });
        setEligibleDriveCount(active.length);
      } catch (error) {
        console.error("Failed to fetch eligible drive count:", error);
      }
    };
    fetchEligibleDriveCount();
  }, [currentUser?.uid, userProfile]);

  return (
    <Container className="py-5">
      <AnimatedSection effect="fade">
        <h2 className="mb-4">Welcome, {userProfile?.name || "Cadet"} !</h2>
      </AnimatedSection>

      <AnimatedSection as={Row} className="g-4" effect="slide">
        {(isAdmin || isSuperAdmin) && (
          <Col xs={12} sm={6} md={4} lg={3} xl={3}>
            <Card className="text-center h-100 shadow-sm hover-lift">
              <Card.Body className="d-flex flex-column justify-content-between">
                <div>
                  <i className="bi bi-person-gear text-danger dashboard-home-icon"></i>
                  <h3 className="mt-3">Roles</h3>
                  <p className="text-muted small">Assign & modify</p>
                </div>
                <Button
                  as={Link}
                  to="/admin/roles"
                  variant="danger"
                  className="mt-2"
                >
                  Manage
                </Button>
              </Card.Body>
            </Card>
          </Col>
        )}

        {(isAdmin || isSuperAdmin) && (
          <Col xs={12} sm={6} md={4} lg={3} xl={3}>
            <Card className="text-center h-100 shadow-sm hover-lift">
              <Card.Body className="d-flex flex-column justify-content-between">
                <div>
                  <i className="bi bi-person-badge text-danger dashboard-home-icon"></i>
                  <h3 className="mt-3">
                    Users
                    {pendingCount > 0 && (
                      <Badge
                        bg="danger"
                        className="ms-2 dashboard-pending-badge"
                      >
                        {pendingCount}
                      </Badge>
                    )}
                  </h3>
                  <p className="text-muted small">Approvals & creds</p>
                </div>
                <Button
                  as={Link}
                  to="/admin/users"
                  variant="danger"
                  className="mt-2"
                >
                  Open
                </Button>
              </Card.Body>
            </Card>
          </Col>
        )}

        {(isAdmin || isSuperAdmin) && (
          <>
            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-people-fill text-primary dashboard-home-icon"></i>
                    <h3 className="mt-3">Cadets</h3>
                    <p className="text-muted small">Manage profiles</p>
                  </div>
                  <Button
                    as={Link}
                    to="/admin/cadets"
                    variant="primary"
                    className="mt-2"
                  >
                    Manage
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-clipboard-check text-success dashboard-home-icon"></i>
                    <h3 className="mt-3">Attendance</h3>
                    <p className="text-muted small">Mark & track</p>
                  </div>
                  <Button
                    as={Link}
                    to="/admin/attendance"
                    variant="success"
                    className="mt-2"
                  >
                    Manage
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-bell text-warning dashboard-home-icon"></i>
                    <h3 className="mt-3">Announcements</h3>
                    <p className="text-muted small">Publish updates</p>
                  </div>
                  <Button
                    as={Link}
                    to="/admin/announcements"
                    variant="warning"
                    className="mt-2"
                  >
                    Manage
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-clipboard2-check text-info dashboard-home-icon"></i>
                    <h3 className="mt-3">Event Manager</h3>
                    <p className="text-muted small">Event drives & polling</p>
                  </div>
                  <Button
                    as={Link}
                    to="/admin/event-drives"
                    variant="info"
                    className="mt-2"
                  >
                    Manage
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          </>
        )}

        {(isAdmin || isSuperAdmin) && (
          <>
            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-file-earmark-text text-secondary dashboard-home-icon"></i>
                    <h3 className="mt-3">Reports</h3>
                    <p className="text-muted small">Document generator</p>
                  </div>
                  <Button
                    as={Link}
                    to="/admin/reports"
                    variant="secondary"
                    className="mt-2"
                  >
                    Open
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          </>
        )}

        {(isAdmin || isSuperAdmin) && (
          <>
            {isSuperAdmin && (
              <>
                <Col xs={12} sm={6} md={4} lg={3} xl={3}>
                  <Card className="text-center h-100 shadow-sm hover-lift">
                    <Card.Body className="d-flex flex-column justify-content-between">
                      <div>
                        <i className="bi bi-mortarboard text-primary dashboard-home-icon"></i>
                        <h3 className="mt-3">
                          Alumni
                          {pendingAlumniCount > 0 && (
                            <Badge
                              bg="danger"
                              className="ms-2 fs-6 align-middle"
                            >
                              {pendingAlumniCount}
                            </Badge>
                          )}
                        </h3>
                        <p className="text-muted small">
                          Manage alumni profiles
                        </p>
                      </div>
                      <Button
                        as={Link}
                        to="/admin/alumni"
                        variant="primary"
                        className="mt-2"
                      >
                        Manage
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
                <Col xs={12} sm={6} md={4} lg={3} xl={3}>
                  <Card className="text-center h-100 shadow-sm hover-lift">
                    <Card.Body className="d-flex flex-column justify-content-between">
                      <div>
                        <i className="bi bi-gear text-secondary dashboard-home-icon"></i>
                        <h3 className="mt-3">Settings</h3>
                        <p className="text-muted small">App configuration</p>
                      </div>
                      <Button
                        as={Link}
                        to="/admin/settings"
                        variant="secondary"
                        className="mt-2"
                      >
                        Configure
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
              </>
            )}

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-bell text-dark dashboard-home-icon"></i>
                    <h3 className="mt-3">
                      Notifications
                      {unreadCount > 0 && (
                        <Badge
                          bg="danger"
                          className="ms-2 dashboard-pending-badge"
                        >
                          {unreadCount}
                        </Badge>
                      )}
                    </h3>
                    <p className="text-muted small">View Updates</p>
                  </div>
                  <Button
                    as={Link}
                    to="/notifications"
                    variant="dark"
                    className="mt-2"
                  >
                    View
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          </>
        )}

        {!isAdmin && !isSuperAdmin && (
          <>
            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-person-circle text-primary dashboard-home-icon"></i>
                    <h3 className="mt-3">My Profile</h3>
                    <p className="text-muted small">View & edit</p>
                  </div>
                  <Button
                    as={Link}
                    to="/profile"
                    variant="primary"
                    className="mt-2"
                  >
                    View Profile
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-clipboard-check text-success dashboard-home-icon"></i>
                    <h3 className="mt-3">Attendance</h3>
                    <p className="text-muted small">Your records</p>
                  </div>
                  <Button
                    as={Link}
                    to="/attendance"
                    variant="success"
                    className="mt-2"
                  >
                    View
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-calendar-event text-warning dashboard-home-icon"></i>
                    <h3 className="mt-3">
                      Event Drives
                      {eligibleDriveCount > 0 && (
                        <Badge
                          bg="danger"
                          className="ms-2 dashboard-pending-badge"
                        >
                          {eligibleDriveCount}
                        </Badge>
                      )}
                    </h3>
                    <p className="text-muted small">Opt-in / Opt-out</p>
                  </div>
                  <Button
                    as={Link}
                    to="/event-drives"
                    variant="warning"
                    className="mt-2"
                  >
                    View Drives
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-book text-info dashboard-home-icon"></i>
                    <h3 className="mt-3">Exam Prep</h3>
                    <p className="text-muted small">Study materials</p>
                  </div>
                  <Button
                    as={Link}
                    to="/exam-prep"
                    variant="info"
                    className="mt-2"
                  >
                    Start Learning
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-trophy text-danger dashboard-home-icon"></i>
                    <h3 className="mt-3">Achievements</h3>
                    <p className="text-muted small">Certificates</p>
                  </div>
                  <Button
                    as={Link}
                    to="/achievements"
                    variant="danger"
                    className="mt-2"
                  >
                    View
                  </Button>
                </Card.Body>
              </Card>
            </Col>

            <Col xs={12} sm={6} md={4} lg={3} xl={3}>
              <Card className="text-center h-100 shadow-sm hover-lift">
                <Card.Body className="d-flex flex-column justify-content-between">
                  <div>
                    <i className="bi bi-bell text-dark dashboard-home-icon"></i>
                    <h3 className="mt-3">
                      Notifications
                      {unreadCount > 0 && (
                        <Badge
                          bg="danger"
                          className="ms-2 dashboard-pending-badge"
                        >
                          {unreadCount}
                        </Badge>
                      )}
                    </h3>
                    <p className="text-muted small">View Updates</p>
                  </div>
                  <Button
                    as={Link}
                    to="/notifications"
                    variant="dark"
                    className="mt-2"
                  >
                    View
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          </>
        )}
      </AnimatedSection>
    </Container>
  );
};

export default Dashboard;
