import { AgentDescriptor, ScopeMatrixRow, WireTraceEvent } from '../types';

export const INITIAL_AGENTS: AgentDescriptor[] = [
  {
    id: 'cc-inst-88194a',
    name: 'Cursor IDE',
    clientType: 'Background Composer v0.42',
    owner: 'Karthik',
    hostMachine: "Karthik's Mac (arm64)",
    syncProtocol: 'HOOKED VIA MCP / LSP',
    scopedRange: 'src/auth/*',
    portOrSocket: 'PORT: 8089 // SYNCED',
    status: 'CONNECTED',
    lockType: 'LOCKING EXCLUSIVE',
    targetFile: 'src/auth/token_exchange.go',
    fileLockType: 'AST LOCK',
    branch: 'feat/jwt-rotation',
    commitOrProcess: 'HEAD: commit c49f10a',
    directive: 'Refactoring token validation middleware & session revocation hooks. AST tree lock active across lines 45–182.',
    tokensPerSec: 89,
    claimTtlRemaining: '12m remaining',
    ttlPercent: 70,
    renewCounter: '2/4',
    badgeLabel: 'VOICE BROADCAST RECEIVED: 4m ago'
  },
  {
    id: 'cld-cli-04192b',
    name: 'Claude 3.7 Sonnet',
    clientType: 'Claude Code CLI v1.1.4',
    owner: 'Surya',
    hostMachine: "Surya's Rig (Linux 6.8)",
    syncProtocol: 'ACTIVE CLI DAEMON',
    scopedRange: 'src/ai-pipeline/*',
    portOrSocket: 'PORT: 9022 // SYNCED',
    status: 'CONNECTED',
    lockType: 'LOCKING EXCLUSIVE',
    targetFile: 'pipelines/stt/whisper_quant.py',
    fileLockType: 'FILE LOCK',
    branch: 'feat/qwen-grammar',
    commitOrProcess: 'CLI PROCESS: #8201',
    directive: 'GBNF grammar compilation & Q4_K_M weights quantization verification. Running local verification runner.',
    tokensPerSec: 112,
    claimTtlRemaining: '24m remaining',
    ttlPercent: 88,
    badgeLabel: 'INVOKED VIA CLI TOOL CALL'
  },
  {
    id: 'cpl-wk-33010x',
    name: 'GitHub Copilot',
    clientType: 'Workspace Protocol',
    owner: 'Tejashwin',
    hostMachine: "Tejashwin's Devbox",
    syncProtocol: 'ACTIVE P2P SYNC',
    scopedRange: 'apps/mobile-shell/*',
    portOrSocket: 'PORT: 7811 // SYNCED',
    status: 'CONNECTED',
    lockType: 'LOCKING SHARED',
    targetFile: 'apps/mobile/src/screens/HapticModal.tsx',
    fileLockType: 'SHARED UI',
    branch: 'feat/expo-haptics',
    commitOrProcess: 'PR #204 ATTACHED',
    directive: 'Wiring native haptic patterns (UINotificationFeedbackGenerator) for collision push alert dismiss flow.',
    tokensPerSec: 42,
    claimTtlRemaining: '5m remaining',
    ttlPercent: 25,
    badgeLabel: 'COMPLETION: 82%'
  },
  {
    id: 'mcp-auto-0007',
    name: 'Custom MCP JSON-RPC',
    clientType: 'Interlock Core Spec v1',
    owner: 'Bot #01',
    hostMachine: 'Automation Worker #01',
    syncProtocol: 'HEADLESS DAEMON',
    scopedRange: 'infrastructure/cdk/*',
    portOrSocket: 'SOCKET: IPC://ROOT-0',
    status: 'CONNECTED',
    lockType: 'INTERCEPTED & PAUSED',
    targetFile: 'src/auth/jwt_validator.go',
    fileLockType: 'COLLISION PREVENTED',
    conflictDetails: "CONFLICT: Karthik's Exclusive AST Lock on `src/auth/*`",
    directive: 'Execution halted by Interlock daemon prior to AST mutation. 14,280 tokens saved from redundant write collision.',
    tokensPerSec: 0,
    claimTtlRemaining: 'Suspended',
    ttlPercent: 100,
    notificationTarget: "NOTIFICATION SENT: Karthik's phone (iOS Push)",
    interventionStatus: 'STATUS: AWAITING RESOLUTION'
  },
  {
    id: 'cline-ext-009',
    name: 'Cline / Roo Code',
    clientType: 'VSCode Extension',
    owner: 'Localhost',
    hostMachine: 'Local IPC Client',
    syncProtocol: 'DIRECT EXTENSION HOOK',
    scopedRange: 'packages/common/*',
    portOrSocket: 'PROBE: STANDBY',
    status: 'READY TO PAIR'
  },
  {
    id: 'windsurf-012',
    name: 'Windsurf Cascade',
    clientType: 'Codeium Engine',
    owner: 'Localhost',
    hostMachine: 'Local Daemon Socket',
    syncProtocol: 'CASCADE AGENT BUS',
    scopedRange: 'services/indexer/*',
    portOrSocket: 'PROBE: STANDBY',
    status: 'READY TO PAIR'
  }
];

export const INITIAL_MATRIX: ScopeMatrixRow[] = [
  {
    id: 'row-1',
    module: 'auth',
    owner: 'Karthik',
    assignedAgent: 'Cursor Composer',
    fileTarget: '.../token_exchange.go',
    lockType: 'EXCLUSIVE',
    timeHeld: '18m 42s'
  },
  {
    id: 'row-2',
    module: 'stt/indexer',
    owner: 'Surya',
    assignedAgent: 'Claude 3.7 CLI',
    fileTarget: '.../whisper_quant.py',
    lockType: 'EXCLUSIVE',
    timeHeld: '06m 15s'
  },
  {
    id: 'row-3',
    module: 'mobile-shell',
    owner: 'Tejashwin',
    assignedAgent: 'Copilot Agent',
    fileTarget: '.../HapticModal.tsx',
    lockType: 'SHARED',
    timeHeld: '25m 01s'
  },
  {
    id: 'row-4',
    module: 'gateway',
    owner: 'System Daemon',
    assignedAgent: 'Interlock Envoy',
    fileTarget: '.../clusters.yaml',
    lockType: 'SHARED (RO)',
    timeHeld: '1d 04h'
  }
];

export const INITIAL_WIRE_TRACE: WireTraceEvent[] = [
  {
    id: 'evt-1',
    timestamp: '14:28:02.192',
    type: 'scope.claim.ack',
    payload: {
      agent: 'cc-inst-88194a',
      ast_node: 'FuncDecl[TokenHandler]',
      ttl_sec: 900,
      status: 'HELD'
    },
    severity: 'info'
  },
  {
    id: 'evt-2',
    timestamp: '14:27:44.801',
    type: 'conflict.interception',
    payload: {
      target: 'src/auth/jwt_validator.go',
      tripped_by: 'mcp-auto-0007',
      blocked_reason: 'PARENT_LOCK_HELD'
    },
    severity: 'crit'
  },
  {
    id: 'evt-3',
    timestamp: '14:26:10.015',
    type: 'lease.heartbeat',
    payload: {
      agent: 'cld-cli-04192b',
      lease_remaining: 1440,
      tokens_sec: 112
    },
    severity: 'info'
  },
  {
    id: 'evt-4',
    timestamp: '14:25:01.440',
    type: 'haptic.dispatch.push',
    payload: {
      recipient: 'karthik_apns',
      event: 'AGENT_INTERCEPT_ALERT',
      ack: true
    },
    severity: 'warn'
  }
];

export const BRAND_LOGO_URL = '/interlock-logo.svg';
