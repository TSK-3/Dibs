// server/oauth.js — the OAuth 2.0 authorization-code flow, provider-agnostic.
// Everything provider-specific lives in ./providers.js; this file is the engine:
// PKCE generation, the authorize URL, the code→token exchange, and the
// profile fetch that always goes through the provider (never through the client).
import crypto from 'node:crypto';
import { ProviderError, maskToken } from './providers.js';

const base64url = (value) => Buffer.from(value).toString('base64url');

/** RFC 7636 S256 pair. Verifier: 32 random bytes, base64url (43 chars). */
export function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}

export const createStateValue = () => base64url(crypto.randomBytes(24));

export function buildRedirectUri(providerId, publicUrl) {
  return `${publicUrl}/api/auth/${providerId}/callback`;
}

/**
 * Step 1 of the flow: the URL we bounce the browser to, plus the secrets that
 * must survive the round-trip (state + PKCE verifier) and therefore live in a
 * short-lived signed cookie rather than in a query string.
 */
export function buildAuthorizeUrl({ provider, credentials, redirectUri, state, codeChallenge }) {
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set('client_id', credentials.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', provider.scopes.join(' '));
  url.searchParams.set('state', state);
  if (provider.pkce && codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [key, value] of Object.entries(provider.authorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Step 2: swap the one-time code for an access token. The secret never leaves
 * this process; the browser only ever sees the redirect.
 */
export async function exchangeCodeForToken({
  provider,
  credentials,
  code,
  redirectUri,
  codeVerifier,
  fetchImpl = fetch,
  logger = console,
}) {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (provider.pkce && codeVerifier) body.set('code_verifier', codeVerifier);

  let response;
  try {
    response = await fetchImpl(provider.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...(provider.tokenHeaders ?? {}),
      },
      body,
    });
  } catch (err) {
    throw new ProviderError('network', `token exchange failed: ${err.message}`);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // GitHub pre-2021 behaviour: urlencoded body. Accept it rather than break.
    payload = Object.fromEntries(new URLSearchParams(text));
  }

  if (!response.ok || !payload?.access_token) {
    const detail = payload?.error_description || payload?.error || text.slice(0, 160);
    throw new ProviderError('exchange_failed', `${provider.id} token exchange → HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  logger.debug?.(`[oauth] ${provider.id} token acquired (${maskToken(payload.access_token)})`);
  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? 'bearer',
    scope: payload.scope ?? provider.scopes.join(' '),
    expiresIn: payload.expires_in ? Number(payload.expires_in) : null,
  };
}

/** Step 3: turn the access token into a normalized Interlock profile. */
export async function fetchProfile({ provider, accessToken, fetchImpl = fetch }) {
  const profile = await provider.fetchProfile({ accessToken, fetchImpl });
  if (!profile?.providerId) {
    throw new ProviderError('profile_failed', `${provider.id} profile had no stable identifier`);
  }
  return profile;
}
