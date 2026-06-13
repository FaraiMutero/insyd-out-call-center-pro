import { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, getAccessToken, setAccessToken } from "./api/client";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import RecordingsPage from "./pages/RecordingsPage";
import AuditPage from "./pages/AuditPage";
import ProfilePage from "./pages/ProfilePage";
import CallReportPage from "./pages/CallReportPage";
import AgentsPage from "./pages/AgentsPage";
import AgentDetailPage from "./pages/AgentDetailPage";
import CoachingPage from "./pages/CoachingPage";
import SOPsPage from "./pages/SOPsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PendingPage from "./pages/PendingPage";
import NotFoundPage from "./pages/NotFoundPage";

function ProtectedLayout({ user, onLogout, recordings }) {
  return (
    <AppLayout user={user} onLogout={onLogout} recordings={recordings}>
      <Outlet />
    </AppLayout>
  );
}

function AdminRoute({ user, children }) {
  if (user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    requestedRole: "agent"
  });

  useEffect(() => {
    async function bootstrap() {
      if (!getAccessToken()) {
        return;
      }

      try {
        const data = await api.status();
        setUser(data.user);
        if (["/", "/login", "/register", "/pending"].includes(location.pathname)) {
          navigate("/dashboard", { replace: true });
        }
      } catch {
        setAccessToken("");
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (["/", "/login", "/register", "/pending"].includes(location.pathname)) {
      navigate("/dashboard", { replace: true });
    }

    if (user.role === "admin") {
      loadUsers();
      if (location.pathname.startsWith("/audit")) {
        loadAuditLogs();
      }
    }

    if (["admin", "manager", "qa"].includes(user.role)) {
      loadRecordings();
    }
  }, [user, location.pathname]);

  const clearFeedback = () => {
    setError("");
    setMessage("");
  };

  async function loadUsers() {
    try {
      const data = await api.listUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAuditLogs() {
    try {
      const data = await api.listAuditLogs({ limit: 50 });
      setAuditLogs(data.logs);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadRecordings() {
    try {
      const data = await api.listRecordings();
      setRecordings(data.recordings);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    try {
      const data = await api.login(loginForm);
      setAccessToken(data.accessToken);
      setUser(data.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err.payload?.error === "ACCOUNT_PENDING") {
        navigate("/pending", { replace: true });
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setLoading(true);
    clearFeedback();

    try {
      const data = await api.register(registerForm);
      setMessage(data.message);
      if (data.user?.status === "active") {
        navigate("/login", { replace: true });
      } else {
        navigate("/pending", { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    setAccessToken("");
    setUser(null);
    setUsers([]);
    setAuditLogs([]);
    setRecordings([]);
    navigate("/login", { replace: true });
  }

  async function saveProfile(payload) {
    clearFeedback();
    try {
      const data = await api.updateProfile(payload);
      setUser(data.user);
      setMessage("Profile updated");
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePassword(payload, onDone) {
    clearFeedback();
    try {
      await api.changePassword(payload);
      if (onDone) {
        onDone();
      }
      setMessage("Password changed. Please sign in again.");
      await handleLogout();
    } catch (err) {
      setError(err.message);
    }
  }

  async function runUserAction(action, id) {
    clearFeedback();

    try {
      if (action === "approve") {
        await api.approveUser(id);
      }
      if (action === "reject") {
        await api.rejectUser(id, "Rejected by admin");
      }
      if (action === "deactivate") {
        await api.deactivateUser(id);
      }
      if (action === "reactivate") {
        await api.reactivateUser(id);
      }
      if (action === "reset") {
        const data = await api.createResetLink(id);
        setMessage(`Reset link for user ${id}: ${window.location.origin}${data.resetLink}`);
      } else {
        setMessage(`Action ${action} completed`);
      }

      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function uploadRecording(form, onDone) {
    clearFeedback();
    if (!form.audioFile) {
      setError("Please choose an audio file");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("audio", form.audioFile);
      formData.append("originalFilename", form.originalFilename || form.audioFile.name);
      formData.append("agentName", form.agentName || "");
      formData.append("direction", form.direction || "");
      formData.append("callDatetime", form.callDatetime || "");

      await api.uploadRecording(formData);
      setMessage("Recording imported and queued successfully");
      if (onDone) {
        onDone();
      }
      await loadRecordings();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setRecordingStatus(id, status) {
    clearFeedback();
    try {
      await api.updateRecordingStatus(id, { status });
      await loadRecordings();
      setMessage(`Recording ${id} updated to ${status}`);
    } catch (err) {
      setError(err.message);
    }
  }

  const feedbackBanner = useMemo(() => {
    if (error) {
      return <p className="feedback error">{error}</p>;
    }
    if (message) {
      return <p className="feedback ok">{message}</p>;
    }
    return null;
  }, [error, message]);

  if (!user) {
    return (
      <div className="auth-shell">
        <Routes>
          <Route
            path="/login"
            element={
              <LoginPage
                form={loginForm}
                setForm={setLoginForm}
                onSubmit={handleLogin}
                loading={loading}
              />
            }
          />
          <Route
            path="/register"
            element={
              <RegisterPage
                form={registerForm}
                setForm={setRegisterForm}
                onSubmit={handleRegister}
                loading={loading}
              />
            }
          />
          <Route path="/pending" element={<PendingPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        {feedbackBanner}
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          element={<ProtectedLayout user={user} onLogout={handleLogout} recordings={recordings} />}
        >
          <Route path="/dashboard" element={<DashboardPage recordings={recordings} user={user} />} />
          <Route path="/calls/:id/report" element={<CallReportPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:name" element={<AgentDetailPage />} />
          <Route path="/coaching" element={<CoachingPage />} />
          <Route path="/sops" element={<SOPsPage />} />
          <Route path="/profile" element={<ProfilePage user={user} onSaveProfile={saveProfile} onChangePassword={changePassword} />} />
          <Route
            path="/recordings"
            element={
              <RecordingsPage
                recordings={recordings}
                onRefresh={loadRecordings}
                onUpload={uploadRecording}
                onStatus={setRecordingStatus}
              />
            }
          />
          <Route
            path="/users"
            element={
              <AdminRoute user={user}>
                <UsersPage users={users} onRefresh={loadUsers} onAction={runUserAction} />
              </AdminRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <AdminRoute user={user}>
                <AuditPage logs={auditLogs} onRefresh={loadAuditLogs} />
              </AdminRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      {feedbackBanner}
    </>
  );
}
