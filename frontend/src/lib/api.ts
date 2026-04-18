import pako from 'pako';

export const API_BASE = '/api/v1';

/**
 * Standard fetch wrapper that handles 401s by redirecting to OIDC login.
 * The express-openid-connect backend will automatically redirect to the IDP.
 */
export async function authFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    // By reloading the document, the browser will request index.html
    // The backend blocks all assets until authenticated, so this handles the entire redirect automatically
    window.location.reload();
    throw new Error('Unauthenticated, refreshing for login...');
  }

  return res;
}

export function inflateBase64(base64Str: string, bodyType: string): any {
  try {
    const binString = atob(base64Str);
    const uintArray = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
        uintArray[i] = binString.charCodeAt(i);
    }
    const inflated = pako.inflate(uintArray, { to: 'string' });
    if (bodyType === 'JSON') return JSON.parse(inflated);
    return inflated;
  } catch (e) {
    console.error('Decompression failed', e);
    return '<decompression-failed>';
  }
}

/**
 * Helper to fetch logs and automatically inflate base64 zlib data.
 */
export async function getLogs(page = 1, limit = 50, q = '') {
  const res = await authFetch(`/logs?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}`, { credentials: 'include' });
  const json = await res.json();
  
  if (!json.data) return json;

  json.data = json.data.map((log: any) => {
    let uncompressedBody = null;
    if (log.body) {
      uncompressedBody = inflateBase64(log.body, log.bodyType);
    }
    return { ...log, body: uncompressedBody };
  });

  return json;
}

export async function clearLogs() {
  const res = await authFetch('/logs', {
    method: 'DELETE',
    credentials: 'include'
  });
  return res.json();
}
