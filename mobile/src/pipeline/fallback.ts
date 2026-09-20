/**
 * Fallback stage (PRD 3.6 step 3): plain string-contains keyword matching
 * against the scope enum. No ML - whole-word keywords per scope, counted;
 * highest count wins; SCOPE_PRIORITY breaks ties (specific scopes before
 * the generic "backend"). If nothing matches at all, a sensible default
 * scope keeps runPipeline() ALWAYS able to return a valid
 * {scope, summary, rationale}.
 *
 * NOTE: the keyword table below is a PROPOSAL awaiting approval (M5).
 * Editing KEYWORD_TABLE / DEFAULT_SCOPE here is the whole change.
 */
import type { Intent, Scope } from './grammar';

/**
 * Tie-break priority: specific scopes first, backend last - backend is the
 * generic bucket the model already over-predicts (M4 finding).
 */
const SCOPE_PRIORITY: Scope[] = [
  'auth',
  'payments',
  'frontend',
  'database',
  'testing',
  'backend',
];

export const KEYWORD_TABLE: Record<Scope, string[]> = {
  auth: [
    'auth',
    'authentication',
    'login',
    'log in',
    'signin',
    'sign in',
    'signup',
    'sign up',
    'password',
    'token',
    'session',
    'oauth',
    'two factor',
    '2fa',
    'credential',
  ],
  payments: [
    'payment',
    'payments',
    'checkout',
    'refund',
    'refunds',
    'invoice',
    'billing',
    'stripe',
    'apple pay',
    'google pay',
    'paypal',
    'cart',
    'subscription',
    'charge',
  ],
  frontend: [
    'frontend',
    'front end',
    'ui',
    'ux',
    'screen',
    'button',
    'layout',
    'page',
    'component',
    'css',
    'dashboard',
    'modal',
    'responsive',
  ],
  database: [
    'database',
    'db',
    'sql',
    'table',
    'schema',
    'migration',
    'migrate',
    'migrating',
    'index',
    'query',
    'column',
    'postgres',
    'mysql',
    'redis',
  ],
  testing: [
    'test',
    'tests',
    'testing',
    'unit test',
    'qa',
    'fixture',
    'fixtures',
    'coverage',
    'e2e',
    'integration test',
  ],
  backend: [
    'backend',
    'back end',
    'api',
    'endpoint',
    'server',
    'rate limiter',
    'middleware',
    'queue',
    'cron',
    'deploy',
    'deployment',
    'service',
  ],
};

/** Used when no keyword matches anything: the generic engineering bucket. */
export const DEFAULT_SCOPE: Scope = 'backend';

export type KeywordMatch = { scope: Scope; matched: string[] };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive "string contains" (PRD: simple, no ML). */
function containsWholeWord(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(text);
}

/** Count keyword hits per scope; highest wins; SCOPE_PRIORITY breaks ties. */
export function matchScopeByKeywords(text: string): KeywordMatch | null {
  const lower = text.toLowerCase();
  let best: KeywordMatch | null = null;
  for (const scope of SCOPE_PRIORITY) {
    const matched = KEYWORD_TABLE[scope].filter((kw) =>
      containsWholeWord(lower, kw),
    );
    if (matched.length > (best?.matched.length ?? 0)) {
      best = { scope, matched };
    }
  }
  return best;
}

function toSummary(transcript: string): string {
  const cleaned = transcript.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Voice update';
  const capped = cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

/**
 * Build a valid intent from keywords alone (or the default scope).
 * The rationale documents HOW it was produced - honest for debugging.
 */
export function keywordFallbackIntent(transcript: string): {
  intent: Intent;
  match: KeywordMatch | null;
} {
  const match = matchScopeByKeywords(transcript);
  const scope = match?.scope ?? DEFAULT_SCOPE;
  const rationale = match
    ? `Keyword match: ${match.matched.join(', ')}`
    : `No keyword match - defaulted to ${DEFAULT_SCOPE}`;
  return {
    intent: { scope, summary: toSummary(transcript), rationale },
    match,
  };
}
