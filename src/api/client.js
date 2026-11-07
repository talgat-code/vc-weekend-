const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const SESSION_STORAGE_KEY = "bcc-ved-session-token";

let sessionPromise;

function readStoredToken() {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // Session storage can be disabled in a privacy-restricted browser. The in-memory token still works.
  }
}

async function createSession() {
  const response = await fetch(`${API_BASE_URL}/sessions`, { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.session_token) {
    throw new Error(data.errors?.[0]?.message || "Не удалось создать AI-сессию.");
  }
  storeToken(data.session_token);
  return data.session_token;
}

export function getSessionToken() {
  const stored = readStoredToken();
  if (stored) return Promise.resolve(stored);
  if (!sessionPromise) {
    sessionPromise = createSession().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function request(path, options = {}) {
  const token = await getSessionToken();
  const headers = new Headers(options.headers || {});
  headers.set("X-Session-Token", token);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.errors?.[0]?.message || data.detail || `AI backend вернул ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

export function createWorkflow(payload) {
  return request("/workflows", { method: "POST", body: JSON.stringify(payload) });
}

export function updateWorkflow(analysisId, payload) {
  return request(`/workflows/${encodeURIComponent(analysisId)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function validateWorkflow(analysisId) {
  return request(`/workflows/${encodeURIComponent(analysisId)}/validate`, { method: "POST" });
}

export function analyzeDocument(file, documentType, analysisId) {
  const body = new FormData();
  body.append("document_type", documentType);
  body.append("file", file);
  if (analysisId) body.append("analysis_id", analysisId);
  return request("/analyze", { method: "POST", body });
}

export function normalizeWorkflow(workflow) {
  const records = [workflow.contract, workflow.application, workflow.invoice];
  const extracted = records.flatMap((record) => Object.values(record?.fields || {}));
  const issues = (workflow.issues || []).map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    field: issue.field_ids?.[0],
    message: issue.message,
    nextStep: issue.recommended_action,
  }));
  return {
    mode: workflow.mode,
    workflow,
    issues,
    nextStep: workflow.next_actions?.[0] || workflow.workflow?.next_action || "Проверьте предложенные значения.",
    metrics: {
      totalPaymentFields: 21,
      autoFilledCount: extracted.filter((field) => ["suggested", "extracted"].includes(field.status)).length,
      blockingCount: issues.filter((issue) => issue.severity === "blocking").length,
      detectedIssueCount: issues.length,
      correctedFieldCount: 0,
    },
  };
}

export { API_BASE_URL };
