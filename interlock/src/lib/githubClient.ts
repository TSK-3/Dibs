// src/lib/githubClient.ts — the SPA's only GitHub surface: repositories owned
// by the signed-in account, served through the identity service's /api proxy.
import { apiGet } from './apiClient';

export interface RepoSummary {
  id: number;
  fullName: string;
  private: boolean;
  htmlUrl: string | null;
  description: string | null;
  defaultBranch: string | null;
  updatedAt: string | null;
  ownerLogin: string | null;
}

interface ReposResponse {
  ok: true;
  repos: RepoSummary[];
}

export async function fetchRepos(): Promise<RepoSummary[]> {
  const body = await apiGet<ReposResponse>('/github/repos');
  return body.repos ?? [];
}
