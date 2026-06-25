const API_BASE = "/api";

let accessToken = localStorage.getItem("accessToken") || "";

export function setAccessToken(token) {
  accessToken = token || "";
  if (token) {
    localStorage.setItem("accessToken", token);
  } else {
    localStorage.removeItem("accessToken");
  }
}

export function getAccessToken() {
  return accessToken;
}

// fetch() exposes no upload-progress events, so the byte-level progress bar on the
// recordings import flow needs XMLHttpRequest instead.
function uploadWithProgress(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* empty body */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const error = new Error(data?.message || data?.error || "Upload failed");
        error.payload = data;
        error.status = xhr.status;
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

async function request(path, options = {}, retry = true) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(options.headers || {})
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (response.status === 401 && retry && path !== "/auth/refresh") {
    const refreshed = await refreshToken();
    if (refreshed) {
      return request(path, options, false);
    }
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Request failed");
    error.payload = data;
    error.status = response.status;
    throw error;
  }

  return data;
}

let refreshInFlight = null;

export async function refreshToken() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const data = await request(
        "/auth/refresh",
        {
          method: "POST"
        },
        false
      );
      if (data?.accessToken) {
        setAccessToken(data.accessToken);
        return true;
      }
      return false;
    } catch {
      setAccessToken("");
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export const api = {
  request,
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  status: () => request("/auth/status"),
  updateProfile: (payload) => request("/auth/profile", { method: "PUT", body: JSON.stringify(payload) }),
  changePassword: (payload) => request("/auth/password", { method: "PUT", body: JSON.stringify(payload) }),
  listUsers: (filters = {}) => {
    const search = new URLSearchParams(filters).toString();
    return request(`/users${search ? `?${search}` : ""}`);
  },
  listAuditLogs: (filters = {}) => {
    const search = new URLSearchParams(filters).toString();
    return request(`/audit${search ? `?${search}` : ""}`);
  },
  approveUser: (id, role) =>
    request(`/users/${id}/approve`, { method: "POST", body: JSON.stringify(role ? { role } : {}) }),
  rejectUser: (id, reason) =>
    request(`/users/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  deactivateUser: (id) => request(`/users/${id}/deactivate`, { method: "POST" }),
  reactivateUser: (id) => request(`/users/${id}/reactivate`, { method: "POST" }),
  createResetLink: (id) => request(`/users/${id}/reset-link`, { method: "POST" }),
  /* Agents (user profiles with role=agent) */
  listAgents: (filters = {}) => {
    const search = new URLSearchParams(filters).toString();
    return request(`/agents${search ? `?${search}` : ""}`);
  },
  createAgent: (payload) => request("/agents", { method: "POST", body: JSON.stringify(payload) }),
  updateAgent: (id, payload) => request(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deactivateAgent: (id) => request(`/agents/${id}`, { method: "DELETE" }),
  reactivateAgent: (id) => request(`/agents/${id}/reactivate`, { method: "POST" }),

  listRecordings: () => request("/recordings"),
  createRecording: (payload) => request("/recordings", { method: "POST", body: JSON.stringify(payload) }),
  uploadRecordingWithProgress: (formData, onProgress) => uploadWithProgress("/recordings/upload", formData, onProgress),
  updateRecordingStatus: (id, payload) =>
    request(`/recordings/${id}/status`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteRecording: (id) => request(`/recordings/${id}`, { method: "DELETE" }),
  getCallReport: (id) => request(`/calls/${id}/report`),
  reanalyzeCall: (id) => request(`/calls/${id}/reanalyze`, { method: "POST" }),
  generateRubric: (callType = "outbound_sales") =>
    request("/sops/generate", { method: "POST", body: JSON.stringify({ callType }) }),
  getActiveRubric: (callType = "outbound_sales") =>
    request(`/sops/rubric?callType=${callType}`),
  listRubrics: () => request("/sops/rubrics"),
  updateRubric: (id, criteria) =>
    request(`/sops/rubric/${id}`, { method: "PATCH", body: JSON.stringify({ criteria }) }),

  /* Dashboard */
  getOrgStats: () => request("/dashboard/org"),
  getLeaderboard: () => request("/dashboard/leaderboard"),
  getAgentDetail: (name) => request(`/dashboard/agents/${encodeURIComponent(name)}`),
  renameAgent: (name, newName) =>
    request(`/dashboard/agents/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify({ newName }) }),
  getTipOfDay: () => request("/dashboard/tip"),

  /* Coaching */
  listCoachingAgents: () => request("/coaching/"),
  getCoachingFeed: (agentName) => request(`/coaching/${encodeURIComponent(agentName)}`),

  /* Export — return a URL for direct download links */
  exportRecordingsCSVUrl: () => `${API_BASE}/export/recordings.csv?token=${encodeURIComponent(accessToken)}`,
  exportCallReportCSVUrl: (id) => `${API_BASE}/export/calls/${id}/report.csv?token=${encodeURIComponent(accessToken)}`,
};
