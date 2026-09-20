// server/github.js — GitHub REST access through the identity service's stored
// OAuth access token. Public repositories only, by product decision: the
// `read:user` scope that sign-in already grants is enough for `GET /user/repos`
// to return the account's public repositories; private ones would require the
// broad `repo` scope, which the console deliberately does not ask for.
import { ProviderError } from './providers.js';

const GITHUB_API_BASE = 'https://api.github.com';

function githubHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'interlock-identity',
  };
}

/** GitHub repo JSON → the shape the web console consumes. */
export function normalizeRepo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'number' ? raw.id : null;
  const fullName = typeof raw.full_name === 'string' && raw.full_name ? raw.full_name : null;
  if (id === null || !fullName) return null;
  return {
    id,
    fullName,
    private: raw.private === true,
    htmlUrl: typeof raw.html_url === 'string' ? raw.html_url : null,
    description: typeof raw.description === 'string' ? raw.description : null,
    defaultBranch: typeof raw.default_branch === 'string' ? raw.default_branch : null,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
    ownerLogin: raw?.owner?.login ? String(raw.owner.login) : null,
  };
}

/**
 * List the repositories the signed-in account owns (public ones, given the
 * granted scopes), newest activity first. Pagination is capped so a huge
 * account cannot stall the request — the UI is a dropdown, not an export tool.
 */
export async function listRepos({ accessToken, fetchImpl = fetch, perPage = 100, maxPages = 2 } = {}) {
  if (!accessToken) {
    throw new ProviderError('github_token_missing', 'no GitHub access token stored for this identity');
  }

  const repos = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url =
      `${GITHUB_API_BASE}/user/repos?sort=updated&direction=desc` +
      `&affiliation=owner&per_page=${perPage}&page=${page}`;
    let response;
    try {
      response = await fetchImpl(url, { headers: githubHeaders(accessToken) });
    } catch (err) {
      throw new ProviderError('github_unreachable', `github user/repos failed: ${err?.message ?? err}`);
    }

    if (response.status === 403 && response.headers?.get?.('x-ratelimit-remaining') === '0') {
      throw new ProviderError('github_rate_limited', 'GitHub API rate limit exhausted');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('github_token_rejected', `GitHub rejected the stored token (HTTP ${response.status})`);
    }
    if (!response.ok) {
      throw new ProviderError('github_unreachable', `github user/repos → HTTP ${response.status}`);
    }

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!Array.isArray(body)) {
      throw new ProviderError('github_unreachable', 'github user/repos returned a non-array body');
    }
    for (const raw of body) {
      const repo = normalizeRepo(raw);
      if (repo) repos.push(repo);
    }
    if (body.length < perPage) break; // last page
  }
  return repos;
}
