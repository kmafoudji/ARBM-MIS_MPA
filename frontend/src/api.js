function getCookie(name) {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function ensureCsrfCookie() {
  if (!getCookie("csrftoken")) {
    await fetch("/api/csrf/", { credentials: "include" });
  }
}

export async function apiFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    await ensureCsrfCookie();
    headers["X-CSRFToken"] = getCookie("csrftoken");
  }

  const res = await fetch(path, { ...options, method, headers, credentials: "include" });

  if (!res.ok) {
    let detail;
    try {
      detail = await res.json();
    } catch {
      detail = { detail: res.statusText };
    }
    const error = new Error(`API ${res.status}`);
    error.detail = detail;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}
