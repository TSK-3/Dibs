// server/providers.js — the supported identity providers, described as data.
// Adding a third (GitLab, Microsoft, Apple…) means appending one entry here and
// one button in src/components/views/AuthView.tsx — nothing else changes.
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const GITHUB_USER = 'https://api.github.com/user';
const GITHUB_EMAILS = 'https://api.github.com/user/emails';

export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

const asString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

async function readJson(response, what) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* provider returned HTML (usually a proxy/error page) — handled below */
  }
  if (!response.ok) {
    const detail = body?.error_description || body?.error?.message || body?.error || body?.message || text.slice(0, 160);
    throw new ProviderError('provider_response', `${what} → HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  if (body === null) throw new ProviderError('provider_response', `${what} → unparseable body`);
  return body;
}

export const PROVIDERS = {
  google: {
    id: 'google',
    label: 'Google',
    accountLabel: 'Gmail / Google Workspace',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'profile'],
    // Google requires `code_verifier` on token exchange whenever a challenge was sent.
    pkce: true,
    authorizeParams: { access_type: 'online', prompt: 'select_account' },
    tokenHeaders: { Accept: 'application/json' },

    /** @returns normalized profile — see UserStore.upsertFromProfile */
    async fetchProfile({ accessToken, fetchImpl = fetch }) {
      const response = await fetchImpl(GOOGLE_USERINFO, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      const raw = await readJson(response, 'google userinfo');
      const sub = asString(raw.sub);
      if (!sub) throw new ProviderError('profile_failed', 'google userinfo did not include a subject id');
      const email = asString(raw.email);
      return {
        provider: 'google',
        providerLabel: 'Google',
        providerId: sub,
        name: asString(raw.name) ?? email ?? 'Google user',
        username: email ? email.split('@')[0] : null,
        email,
        // Google returns email_verified as a JSON boolean; anything else is unverified.
        emailVerified: raw.email_verified === true,
        avatarUrl: asString(raw.picture),
      };
    },
  },

  github: {
    id: 'github',
    label: 'GitHub',
    accountLabel: 'GitHub account',
    clientIdEnv: 'GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'user:email'],
    // Confidential web app: client_secret authenticates us, so no verifier is sent.
    pkce: false,
    authorizeParams: {},
    // Without this header GitHub answers form-encoded instead of JSON.
    tokenHeaders: { Accept: 'application/json' },

    async fetchProfile({ accessToken, fetchImpl = fetch }) {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'interlock-identity',
      };
      const raw = await readJson(await fetchImpl(GITHUB_USER, { headers }), 'github user');
      const providerId = raw.id != null ? String(raw.id) : null;
      if (!providerId) throw new ProviderError('profile_failed', 'github user response did not include an id');

      // `user.email` is only populated for users who made their address public,
      // so fall back to the emails endpoint and take the primary verified one.
      let email = asString(raw.email);
      let emailVerified = email !== null;
      if (!email) {
        const emails = await readJson(await fetchImpl(GITHUB_EMAILS, { headers }), 'github emails');
        const list = Array.isArray(emails) ? emails : [];
        const chosen = list.find((e) => e?.primary && e?.verified) ?? list.find((e) => e?.verified) ?? null;
        email = asString(chosen?.email);
        emailVerified = chosen?.verified === true;
      }

      const login = asString(raw.login);
      return {
        provider: 'github',
        providerLabel: 'GitHub',
        providerId,
        name: asString(raw.name) ?? login ?? 'GitHub user',
        username: login,
        email,
        emailVerified,
        avatarUrl: asString(raw.avatar_url),
      };
    },
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function credentialsFor(provider, env = process.env) {
  const clientId = asString(env[provider.clientIdEnv]);
  const clientSecret = asString(env[provider.clientSecretEnv]);
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

export function getProvider(id, { env = process.env, providers = PROVIDERS } = {}) {
  const provider = Object.prototype.hasOwnProperty.call(providers, id) ? providers[id] : null;
  if (!provider) return null;
  return { provider, credentials: credentialsFor(provider, env) };
}

/** Public, non-secret description of every provider — drives the sign-in UI. */
export function describeProviders({ env = process.env, providers = PROVIDERS } = {}) {
  return Object.values(providers).map((provider) => {
    const { configured } = credentialsFor(provider, env);
    return {
      id: provider.id,
      label: provider.label,
      accountLabel: provider.accountLabel,
      scopes: provider.scopes,
      pkce: provider.pkce === true,
      configured,
      // Which environment variables an operator has to set when `configured`
      // is false. Names only — never values.
      setupEnv: [provider.clientIdEnv, provider.clientSecretEnv],
    };
  });
}

/** Redaction helper for logs: never print a full provider token. */
export const maskToken = (token) =>
  typeof token === 'string' && token.length > 10 ? `${token.slice(0, 4)}…${token.slice(-4)}` : '«redacted»';

