// src/state/WorkspaceContext.tsx — the SPA's single source of truth for the
// active workspace: listing, creating, joining, and selecting one. The active
// choice persists in localStorage so a reload lands back in the same room.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Workspace,
  WorkspaceCreateInput,
  createWorkspace as apiCreate,
  deleteWorkspace as apiDelete,
  joinWorkspace as apiJoin,
  listWorkspaces,
  regenerateInviteCode as apiRegenerate,
} from '../lib/workspaceClient';

const STORAGE_KEY = 'interlock.activeWorkspaceId';

export type WorkspaceStatus = 'loading' | 'ready';

export interface WorkspaceContextValue {
  status: WorkspaceStatus;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  error: string | null;
  busy: boolean;
  create: (input: WorkspaceCreateInput) => Promise<{ workspace: Workspace; inviteCode: string }>;
  join: (code: string) => Promise<Workspace>;
  select: (id: string | null) => void;
  regenerateInvite: (id: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<WorkspaceStatus>('loading');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      const list = await listWorkspaces();
      setWorkspaces(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load workspaces.');
      setWorkspaces([]);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (status !== 'ready' || !activeId) return;
    const timer = window.setInterval(() => {
      void listWorkspaces()
        .then((list) => setWorkspaces(list))
        .catch(() => {
          // Keep the last known roster visible during a transient request failure.
        });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, activeId]);

  // Drop a stored selection that no longer exists (deleted elsewhere, other
  // account, cleared server data) instead of gating the app on a ghost room.
  useEffect(() => {
    if (status !== 'ready') return;
    if (activeId && !workspaces.some((w) => w.id === activeId)) {
      setActiveId(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [status, workspaces, activeId]);

  const select = useCallback((id: string | null) => {
    setActiveId(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const create = useCallback(
    async (input: WorkspaceCreateInput) => {
      setBusy(true);
      setError(null);
      try {
        const result = await apiCreate(input);
        setWorkspaces((prev) => [result.workspace, ...prev.filter((w) => w.id !== result.workspace.id)]);
        select(result.workspace.id);
        return result;
      } finally {
        setBusy(false);
      }
    },
    [select],
  );

  const join = useCallback(
    async (code: string) => {
      setBusy(true);
      setError(null);
      try {
        const workspace = await apiJoin(code);
        setWorkspaces((prev) => [workspace, ...prev.filter((w) => w.id !== workspace.id)]);
        select(workspace.id);
        return workspace;
      } finally {
        setBusy(false);
      }
    },
    [select],
  );

  const regenerateInvite = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      return await apiRegenerate(id);
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        await apiDelete(id);
        setWorkspaces((prev) => prev.filter((w) => w.id !== id));
        if (activeId === id) select(null);
      } finally {
        setBusy(false);
      }
    },
    [activeId, select],
  );

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status,
      workspaces,
      activeWorkspace: workspaces.find((w) => w.id === activeId) ?? null,
      error,
      busy,
      create,
      join,
      select,
      regenerateInvite,
      remove,
      refresh,
      clearError,
    }),
    [status, workspaces, activeId, error, busy, create, join, select, regenerateInvite, remove, refresh, clearError],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return context;
}
