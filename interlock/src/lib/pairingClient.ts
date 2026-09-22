// src/lib/pairingClient.ts — fetch / regenerate the agent-pairing token for a
// workspace. The server returns both the raw token and the ready-to-paste MCP
// config block; the token is the credential, so it only ever travels over the
// authenticated session cookie.
import { apiGet, apiPost } from './apiClient';

export interface PairingMeta {
  createdAt: string | null;
  rotatedAt: string | null;
  lastUsedAt: string | null;
}

export interface McpServerConfig {
  url: string;
  headers: { Authorization: string };
}

export interface Pairing {
  workspaceId: string;
  workspaceName: string;
  token: string;
  mcpUrl: string;
  config: { mcpServers: { interlock: McpServerConfig } };
  meta: PairingMeta | null;
}

interface PairingResponse {
  ok: true;
  workspaceId: string;
  workspaceName: string;
  token: string;
  mcpUrl: string;
  config: { mcpServers: { interlock: McpServerConfig } };
  meta: PairingMeta | null;
}

export async function getPairing(workspaceId: string): Promise<Pairing> {
  const body = await apiGet<PairingResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/pairing`);
  return body;
}

export async function regeneratePairing(workspaceId: string): Promise<Pairing> {
  const body = await apiPost<PairingResponse>(`/workspaces/${encodeURIComponent(workspaceId)}/pairing/regenerate`);
  return body;
}
