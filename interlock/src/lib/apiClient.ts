// src/lib/apiClient.ts — shared same-origin JSON client for the workspace and
// GitHub surfaces. Same contract as authClient.ts: every call is `/api/...`,
// credentials ride the HttpOnly session cookie, and server error codes map to
// copy a human can act on.

export class ApiError extends Error {
  code: string;
  status: number;
  detail: string | null;
  constructor(code: string, status: number, detail: string | null = null) {
    super(detail ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('network_error', 0, 'Could not reach the identity service.');
  }
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.ok) {
    throw new ApiError(payload?.error ?? 'server_error', response.status, payload?.detail ?? null);
  }
  return payload as T;
}

export const apiGet = <T,>(path: string) => request<T>('GET', path);
export const apiPost = <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
export const apiDelete = <T,>(path: string) => request<T>('DELETE', path);

/** Server error codes → copy a human can act on. */
export const API_ERROR_MESSAGES: Record<string, string> = {
  no_session: 'Your session expired — please sign in again.',
  unknown_identity: 'This account is no longer known to the server — please sign in again.',
  not_github_session: 'Sign in with GitHub to list your repositories.',
  github_token_missing: 'GitHub needs one more sign-in so the server can hold a fresh access token.',
  github_token_rejected: 'GitHub rejected the stored token — sign out and sign in again.',
  github_rate_limited: 'GitHub API rate limit reached — try again in a few minutes.',
  github_unreachable: 'Could not reach GitHub. Check the connection and retry.',
  invalid_code: 'That invite code does not match any workspace.',
  validation_error: 'Some fields need attention before this can be saved.',
  forbidden: 'Only the workspace owner can do that.',
  network_error: 'Could not reach the server. Check the connection and retry.',
};

export const describeApiError = (err: unknown): string => {
  if (err instanceof ApiError) {
    return API_ERROR_MESSAGES[err.code] ?? (err.detail ? `${err.detail}` : `Request failed (${err.code}).`);
  }
  return 'Something went wrong. Please try again.';
};
