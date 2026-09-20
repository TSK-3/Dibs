export type NavigationPath = 
  | 'team-workspace'
  | 'connect-agents'
  | 'agent-fleet-dashboard'
  | 'auth';

export interface AgentDescriptor {
  id: string;
  name: string;
  clientType: string;
  owner: string;
  hostMachine: string;
  syncProtocol: string;
  scopedRange: string;
  portOrSocket: string;
  status: 'CONNECTED' | 'READY TO PAIR' | 'INTERCEPTED';
  lockType?: 'LOCKING EXCLUSIVE' | 'LOCKING SHARED' | 'INTERCEPTED & PAUSED';
  targetFile?: string;
  fileLockType?: 'AST LOCK' | 'FILE LOCK' | 'SHARED UI' | 'COLLISION PREVENTED';
  branch?: string;
  commitOrProcess?: string;
  directive?: string;
  tokensPerSec?: number;
  claimTtlRemaining?: string;
  ttlPercent?: number;
  renewCounter?: string;
  badgeLabel?: string;
  conflictDetails?: string;
  interventionStatus?: string;
  notificationTarget?: string;
}

export interface ScopeMatrixRow {
  id: string;
  module: string;
  owner: string;
  assignedAgent: string;
  fileTarget: string;
  lockType: 'EXCLUSIVE' | 'SHARED' | 'SHARED (RO)';
  timeHeld: string;
}

export interface WireTraceEvent {
  id: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
  severity?: 'info' | 'warn' | 'crit';
}
