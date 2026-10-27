const rawApiBase = (import.meta.env.VITE_API_URL || '/api').trim();
const normalizedBase = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase;
const API_BASE = normalizedBase || '/api';

export async function checkBackendHealth() {
  try {
    const rawApiBase = (import.meta.env.VITE_API_URL || '/api').trim();
    const serverBase = rawApiBase.replace(/\/api\/?$/, '');
    const healthUrl = `${serverBase || ''}/health`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    let data = null;
    try {
      data = await res.json();
    } catch {}

    if (res.status === 503 || (data && data.database && !data.database.ready)) {
      return {
        status: 'DATABASE_UNAVAILABLE',
        message: 'Database connection lost. Sentinel Govern cannot currently confirm that changes are being saved.',
        database: data?.database || null
      };
    }

    if (!res.ok) {
      return {
        status: 'BACKEND_UNREACHABLE',
        message: 'Cannot connect to Sentinel Govern. Check that the backend is running.',
        error: `HTTP ${res.status}`
      };
    }

    return {
      status: 'HEALTHY',
      database: data?.database || null
    };
  } catch (err) {
    return {
      status: 'BACKEND_UNREACHABLE',
      message: 'Cannot connect to Sentinel Govern. Check that the backend is running.',
      error: err.message
    };
  }
}

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sentinel_token') || localStorage.getItem('aegis_token');
}

async function request(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const endpoint = url.startsWith('/') ? url : `/${url}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include' // Required for HttpOnly refresh token cookies
    });
  } catch (netErr) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sentinel:connection_status', {
        detail: {
          status: 'BACKEND_UNREACHABLE',
          message: 'Cannot connect to Sentinel Govern. Check that the backend is running.'
        }
      }));
    }
    throw netErr;
  }

  const contentType = response.headers.get('content-type') || '';
  let json = {};
  if (contentType.includes('application/json')) {
    try {
      json = await response.json();
    } catch {
      json = { error: 'Invalid JSON payload received from server.' };
    }
  } else {
    const text = await response.text();
    json = { error: text || `HTTP error ${response.status}` };
  }

  if (!response.ok) {
    if (response.status === 503) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:connection_status', {
          detail: {
            status: 'DATABASE_UNAVAILABLE',
            message: 'Database connection lost. Sentinel Govern cannot currently confirm that changes are being saved.'
          }
        }));
      }
    }
    if (response.status === 401) {
      localStorage.removeItem('sentinel_token');
      localStorage.removeItem('aegis_token');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:unauthorized', { detail: { error: json.error } }));
        window.dispatchEvent(new CustomEvent('aegis:unauthorized', { detail: { error: json.error } }));
      }
    }
    const err = new Error(json.error || `HTTP error ${response.status}`);
    err.status = response.status;
    err.data = json;
    throw err;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sentinel:connection_status', {
      detail: { status: 'HEALTHY' }
    }));
  }

  return json.data !== undefined ? json.data : json;
}

// ─── Authentication ────────────────────────────────────────────────────────────

export const googleAuthLogin = (credential) =>
  request('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });

export const nativeSignup = (data) =>
  request('/auth/signup', { method: 'POST', body: JSON.stringify(data) });

export const nativeLogin = (data) =>
  request('/auth/login', { method: 'POST', body: JSON.stringify(data) });

export const completeOnboarding = (data) =>
  request('/auth/onboarding', { method: 'POST', body: JSON.stringify(data) });

export const refreshAuthToken = () =>
  request('/auth/refresh', { method: 'POST' });

export const forgotPassword = (email) =>
  request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });

export const resetPassword = (token, password) =>
  request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });

export const getAuthMe = () => request('/auth/me');

export const updateUserProfile = (data) =>
  request('/auth/profile', { method: 'PATCH', body: JSON.stringify(data) });

export const changeUserPassword = (data) =>
  request('/auth/change-password', { method: 'POST', body: JSON.stringify(data) });

export const logoutAuth = () =>
  request('/auth/logout', { method: 'POST' });

// ─── Platform Administration (Platform Admin Only) ────────────────────────────

export const getAdminUsers = () => request('/admin/users');
export const updateAdminUserRole = (userId, role) =>
  request(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const updateAdminUserStatus = (userId, status) =>
  request(`/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const verifyAdminUser = (userId) =>
  request(`/admin/users/${userId}/verify`, { method: 'PATCH' });
export const blockAdminUser = (userId) =>
  request(`/admin/users/${userId}/block`, { method: 'PATCH' });
export const unblockAdminUser = (userId) =>
  request(`/admin/users/${userId}/unblock`, { method: 'PATCH' });

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = () => request('/dashboard/stats');

// ─── Models ───────────────────────────────────────────────────────────────────

export const getModels = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/models${query ? `?${query}` : ''}`);
};
export const getModelById = (id) => request(`/models/${id}`);
export const createModel = (data) =>
  request('/models', { method: 'POST', body: JSON.stringify(data) });
export const updateModelRisk = (id, data) =>
  request(`/models/${id}/risk`, { method: 'PATCH', body: JSON.stringify(data) });
export const updateModelPolicy = (id, policyId) =>
  request(`/models/${id}/policy`, { method: 'PATCH', body: JSON.stringify({ policyId }) });
export const createModelVersion = (modelId, data) =>
  request(`/models/${modelId}/versions`, { method: 'POST', body: JSON.stringify(data) });
export const transitionLifecycle = (versionId, data) =>
  request(`/models/versions/${versionId}/transition`, { method: 'POST', body: JSON.stringify(data) });

export const uploadReferenceDataset = async (modelId, versionId, formData) => {
  const token = localStorage.getItem('sentinel_token') || localStorage.getItem('aegis_token');
  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_BASE}/models/${modelId}/versions/${versionId}/reference-dataset`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include'
  });

  const json = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('sentinel_token');
      localStorage.removeItem('aegis_token');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:unauthorized', { detail: { error: json.error } }));
        window.dispatchEvent(new CustomEvent('aegis:unauthorized', { detail: { error: json.error } }));
      }
    }
    const err = new Error(json.error || `HTTP error ${response.status}`);
    err.status = response.status;
    err.data = json;
    throw err;
  }
  return json.data !== undefined ? json.data : json;
};

export const getReferenceDataset = (modelId, versionId) =>
  request(`/models/${modelId}/versions/${versionId}/reference-dataset`);

// ─── Evaluations & Fairness ───────────────────────────────────────────────────

export const runEvaluation = (versionId, data) =>
  request(`/evaluations/run/${versionId}`, { method: 'POST', body: JSON.stringify(data) });

export const uploadEvaluationFile = async (versionId, formData) => {
  const token = localStorage.getItem('sentinel_token') || localStorage.getItem('aegis_token');
  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_BASE}/evaluations/upload/${versionId}`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include'
  });

  const json = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('sentinel_token');
      localStorage.removeItem('aegis_token');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sentinel:unauthorized', { detail: { error: json.error } }));
        window.dispatchEvent(new CustomEvent('aegis:unauthorized', { detail: { error: json.error } }));
      }
    }
    const err = new Error(json.error || `HTTP error ${response.status}`);
    err.status = response.status;
    err.data = json;
    throw err;
  }
  return json.data !== undefined ? json.data : json;
};

export const getEvaluations = (versionId) => request(`/evaluations/version/${versionId}`);

// ─── Policies ─────────────────────────────────────────────────────────────────

export const getPolicies = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/policies${query ? `?${query}` : ''}`);
};
export const getPolicyById = (id) => request(`/policies/${id}`);
export const createPolicy = (data) =>
  request('/policies', { method: 'POST', body: JSON.stringify(data) });
export const updatePolicy = (id, data) =>
  request(`/policies/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const checkPolicyGate = (versionId) =>
  request(`/policies/check/${versionId}`, { method: 'POST' });

// ─── Approvals ────────────────────────────────────────────────────────────────

export const getPendingApprovals = (status = 'pending') => 
  request(`/approvals/pending?status=${status}`);
export const getCompletedApprovals = () => request('/approvals/completed');
export const getApprovals = (versionId) => request(`/approvals/version/${versionId}`);
export const submitApproval = (versionId, data) =>
  request(`/approvals/${versionId}`, { method: 'POST', body: JSON.stringify(data) });

// ─── Telemetry & Drift ────────────────────────────────────────────────────────

export const getTelemetry = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/telemetry${query ? `?${query}` : ''}`);
};
export const getMonitoringServicesStatus = () =>
  request('/telemetry/services-status');
export const getWorkloadsStatus = () =>
  request('/telemetry/workloads');
export const getSchedulerStatus = () =>
  request('/telemetry/scheduler/status');
export const pauseScheduler = () =>
  request('/telemetry/scheduler/pause', { method: 'POST' });
export const resumeScheduler = () =>
  request('/telemetry/scheduler/resume', { method: 'POST' });
export const setSchedulerMode = (mode) =>
  request('/telemetry/scheduler/mode', { method: 'POST', body: JSON.stringify({ mode }) });
export const triggerSchedulerBatch = (data) =>
  request('/telemetry/scheduler/trigger', { method: 'POST', body: JSON.stringify(data) });
export const getMonitoringOverview = (modelId, versionId = '', workloadId = '') => {
  const params = new URLSearchParams();
  if (versionId) params.append('versionId', versionId);
  if (workloadId) params.append('workloadId', workloadId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request(`/telemetry/overview${modelId ? `/${modelId}` : ''}${qs}`);
};
export const evaluateExternalTelemetry = (data) =>
  request('/telemetry/evaluate-external', { method: 'POST', body: JSON.stringify(data) });
export const simulateTelemetry = (data) =>
  request('/telemetry/simulate', { method: 'POST', body: JSON.stringify(data) });
export const ingestTelemetry = (data) =>
  request('/telemetry/ingest', { method: 'POST', body: JSON.stringify(data) });

// ─── Incidents & Rollback ─────────────────────────────────────────────────────

export const getIncidents = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/incidents${query ? `?${query}` : ''}`);
};
export const getIncidentById = (id) => request(`/incidents/${id}`);
export const updateIncidentStatus = (id, data) =>
  request(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const triggerRollback = (data) =>
  request('/incidents/rollback', { method: 'POST', body: JSON.stringify(data) });

// ─── Reports & Drift Analysis ─────────────────────────────────────────────────

export const getReports = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/reports${query ? `?${query}` : ''}`);
};
export const getReportById = (id) => {
  const resolvedId = (typeof id === 'object' && id !== null)
    ? (id._id || id.id || id.reportNumber || id.reportId)
    : id;
  return request(`/reports/${resolvedId}`);
};
export const compareModelVersions = (modelId) =>
  request(`/models/${modelId}/versions/compare`);

// ─── Issue Reporting ──────────────────────────────────────────────────────────

export const getIssues = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/issues${query ? `?${query}` : ''}`);
};
export const getIssueById = (id) => request(`/issues/${id}`);
export const createIssue = (data) =>
  request('/issues', { method: 'POST', body: JSON.stringify(data) });
export const updateIssue = (id, data) =>
  request(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const escalateIssueToIncident = (id, data = {}) =>
  request(`/issues/${id}/escalate`, { method: 'POST', body: JSON.stringify(data) });

// ─── Audit Ledger & Dossier ───────────────────────────────────────────────────

export const getAuditLedger = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/audit${query ? `?${query}` : ''}`);
};
export const checkAuditIntegrity = () => request('/audit/integrity');
export const simulateTamper = (data) =>
  request('/audit/simulate-tamper', { method: 'POST', body: JSON.stringify(data) });
export const repairAuditLedger = () => request('/audit/repair', { method: 'POST' });
export const getComplianceDossier = (modelId, versionId = '') =>
  request(`/audit/dossier/${modelId}${versionId ? `/${versionId}` : ''}`);

export const downloadComplianceDossierPdf = async (modelId, versionId = '', modelName = 'Model', versionTag = 'v1.0') => {
  const token = getAuthToken();
  const headers = {
    Accept: 'application/pdf',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(`${API_BASE}/audit/dossier/${modelId}${versionId ? `/${versionId}` : ''}?format=pdf`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });
  if (!response.ok) {
    let errorMsg = `Failed to generate PDF (${response.status})`;
    try {
      const json = await response.json();
      if (json.error) errorMsg = json.error;
    } catch {}
    throw new Error(errorMsg);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AI_Governance_Dossier_${modelName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${versionTag.replace(/[^a-zA-Z0-9_.-]/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadIssueReportPdf = async (issueId, reportNumber = 'Issue') => {
  const token = getAuthToken();
  const headers = {
    Accept: 'application/pdf',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(`${API_BASE}/issues/${issueId}/export?format=pdf`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });
  if (!response.ok) {
    let errorMsg = `Failed to generate PDF (${response.status})`;
    try {
      const json = await response.json();
      if (json.error) errorMsg = json.error;
    } catch {}
    throw new Error(errorMsg);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Governance_Issue_${reportNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadIssueReportMarkdown = async (issueId, reportNumber = 'Issue') => {
  const token = getAuthToken();
  const headers = {
    Accept: 'text/markdown',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(`${API_BASE}/issues/${issueId}/export?format=markdown`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Governance_Issue_${reportNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadIssueReportJson = async (issueId, reportNumber = 'Issue') => {
  const token = getAuthToken();
  const headers = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(`${API_BASE}/issues/${issueId}/export?format=json`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Governance_Issue_${reportNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadDriftReportPdf = async (reportId, reportNumber = 'Drift_Report') => {
  const token = getAuthToken();
  const headers = {
    Accept: 'application/pdf',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const response = await fetch(`${API_BASE}/reports/${reportId}/export?format=pdf`, {
    method: 'GET',
    headers,
    credentials: 'include'
  });
  if (!response.ok) {
    let errorMsg = `Failed to generate PDF (${response.status})`;
    try {
      const json = await response.json();
      if (json.error) errorMsg = json.error;
    } catch {}
    throw new Error(errorMsg);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(reportNumber || 'Drift_Report').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── Model API Configuration ──────────────────────────────────────────────────

export const getModelVersions = (modelId) =>
  request(`/models/${modelId}/versions`);

export const getModelEndpointConfig = (modelId, versionId = '') =>
  request(`/models/${modelId}/endpoint${versionId ? `?versionId=${versionId}` : ''}`);

export const updateModelEndpoint = (modelId, data) =>
  request(`/models/${modelId}/endpoint`, { method: 'PATCH', body: JSON.stringify(data) });

export const updateVersionEndpoint = (modelId, versionId, data) =>
  request(`/models/${modelId}/versions/${versionId}/endpoint`, { method: 'PATCH', body: JSON.stringify(data) });

export const testEndpointConnection = (modelId, data) =>
  request(`/models/${modelId}/test-connection`, { method: 'POST', body: JSON.stringify(data) });

export const predictModel = (modelId, data) =>
  request(`/models/${modelId}/predict`, { method: 'POST', body: JSON.stringify(data) });

// ─── Notifications ────────────────────────────────────────────────────────────

export const getNotifications = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/notifications${query ? `?${query}` : ''}`);
};
export const markNotificationRead = (id) =>
  request(`/notifications/${id}/read`, { method: 'PATCH' });
export const markAllNotificationsRead = () =>
  request('/notifications/read-all', { method: 'PATCH' });


