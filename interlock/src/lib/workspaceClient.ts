// src/lib/workspaceClient.ts — create / list / join / inspect / rotate / delete
// workspaces through the identity service.
import { apiDelete, apiGet, apiPost } from './apiClient';

export interface WorkspaceRepo {
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string | null;
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  provider: string;
}

export interface Workspace {
  id: string;
  name: string;
  repo: WorkspaceRepo;
  ownerUserId: string;
  members: WorkspaceMember[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCreateInput {
  name: string;
  repo: WorkspaceRepo;
}

interface WorkspaceResponse {
  ok: true;
  workspace: Workspace;
  inviteCode?: string;
}

interface WorkspaceListResponse {
  ok: true;
  workspaces: Workspace[];
}

export async function createWorkspace(input: WorkspaceCreateInput): Promise<{ workspace: Workspace; inviteCode: string }> {
  const body = await apiPost<WorkspaceResponse>('/workspaces', input);
  return { workspace: body.workspace, inviteCode: body.inviteCode ?? '' };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const body = await apiGet<WorkspaceListResponse>('/workspaces');
  return body.workspaces ?? [];
}

export async function joinWorkspace(code: string): Promise<Workspace> {
  const body = await apiPost<WorkspaceResponse>('/workspaces/join', { code });
  return body.workspace;
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const body = await apiGet<WorkspaceResponse>(`/workspaces/${encodeURIComponent(id)}`);
  return body.workspace;
}

export async function regenerateInviteCode(id: string): Promise<string> {
  const body = await apiPost<{ ok: true; inviteCode: string }>(`/workspaces/${encodeURIComponent(id)}/invite/regenerate`);
  return body.inviteCode;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiDelete(`/workspaces/${encodeURIComponent(id)}`);
}
