import { db } from "@/shared/config/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Container,
  Spinner,
  Tab,
  Tabs,
} from "react-bootstrap";
import toast from "react-hot-toast";
import type { ManagedUser, PendingCadet } from "./types";
import CadetDirectoryTab from "./tabs/CadetDirectoryTab";
import RolesTab from "./tabs/RolesTab";
import AuthTab from "./tabs/AuthTab";
import PendingTab from "./tabs/PendingTab";
import { useAuth } from "@/features/auth/AuthContext";
import { isAnoUser } from "@/shared/utils/userType";
import "./UserManagement.css";

const UserManagement: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [showAnoModal, setShowAnoModal] = useState(false);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingCadet[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("cadets");

  const fetchUsers = async () => {
    const usersRef = collection(db, "users");
    const qUsers = query(usersRef, orderBy("createdAt", "desc"));
    const snapshotUsers = await getDocs(qUsers);
    const activeUsers = snapshotUsers.docs.map((d) => ({
      uid: d.id,
      ...(d.data() as object),
    }));

    const alumniRef = collection(db, "alumni");
    const qAlumni = query(alumniRef, orderBy("archivedAt", "desc"));
    const snapshotAlumni = await getDocs(qAlumni);
    const alumniUsers = snapshotAlumni.docs.map((d) => ({
      uid: d.id,
      role: "alumni" as const,
      ...(d.data() as object),
    }));

    const all = [...activeUsers, ...alumniUsers];
    setUsers(all as ManagedUser[]);
  };

  const fetchPending = async () => {
    const ref = collection(db, "pendingCadets");
    const q = query(ref, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    setPendingUsers(
      snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as object),
      })) as PendingCadet[],
    );
  };

  const refreshAll = async () => {
    await Promise.all([fetchUsers(), fetchPending()]);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await refreshAll();
      } catch (error) {
        console.error("Failed to load user management data:", error);
        toast.error("Failed to load user management data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const pendingCount = useMemo(() => {
    const existingEmails = new Set(
      users.map((u) => u.email?.toLowerCase()).filter(Boolean),
    );
    return pendingUsers.filter(
      (c) => !existingEmails.has(c.email?.toLowerCase()),
    ).length;
  }, [users, pendingUsers]);

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner as="span" animation="border" variant="primary" size="sm" />
        <p className="mt-3">Loading user management...</p>
      </Container>
    );
  }

  return (
    <Container className="py-5">
      <Card className="shadow">
        <Card.Header className="bg-primary text-white d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
          <h3 className="mb-0">
            <i className="bi bi-people me-2"></i>
            User Management
          </h3>
          <div className="d-flex gap-2">
            {activeTab === "auth" && isAnoUser(userProfile) && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowAnoModal(true)}
              >
                <i className="bi bi-person-plus me-1"></i> Add ANO
              </Button>
            )}
            <Button variant="light" size="sm" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left me-1"></i> Back
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          <Tabs
            activeKey={activeTab}
            onSelect={(k: string | null) => setActiveTab(k || "cadets")}
            id="user-management-tabs"
            className="mb-3"
          >
            <Tab eventKey="cadets" title="Cadets">
              <CadetDirectoryTab users={users} onUsersChange={setUsers} />
            </Tab>
            <Tab eventKey="roles" title="Roles">
              <RolesTab users={users} onRefresh={refreshAll} />
            </Tab>
            <Tab eventKey="auth" title="Auth">
              <AuthTab 
                users={users} 
                onRefresh={refreshAll} 
                showAnoModal={showAnoModal}
                setShowAnoModal={setShowAnoModal}
              />
            </Tab>
            <Tab
              eventKey="pending"
              title={
                <span>
                  Pending Approvals
                  {pendingCount > 0 && (
                    <Badge bg="danger" className="ms-2">
                      {pendingCount}
                    </Badge>
                  )}
                </span>
              }
            >
              <PendingTab
                users={users}
                pendingUsers={pendingUsers}
                onRefresh={refreshAll}
              />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default UserManagement;
