/**
 * M4 test sentence suite (27 sentences: clean, rambling, filler words,
 * vague, multi-topic) with the EXPECTED scope for each.
 *
 * Expected labels are our taxonomy judgment calls (PRD 3.3 enum). The
 * multi-topic and vague ones especially are debatable - review before
 * treating a FAIL as a model failure.
 */
import type { Scope } from './grammar';

export type TestSentence = { text: string; expected: Scope };

export const TEST_SENTENCES: TestSentence[] = [
  // --- clean phrasing
  { text: 'starting on the auth refactor, cleaning up the token validation logic', expected: 'auth' },
  { text: 'updating the checkout flow to support card payments', expected: 'payments' },
  { text: 'adding an index to the users table', expected: 'database' },
  { text: 'add a rate limiter to the API', expected: 'backend' },
  { text: 'writing unit tests for the login flow', expected: 'testing' },
  { text: 'building the new settings screen', expected: 'frontend' },
  { text: 'migrating the orders table to the new schema', expected: 'database' },
  { text: 'fixing the payment webhook retry logic', expected: 'payments' },
  { text: 'refactoring the API error handling', expected: 'backend' },
  { text: 'debugging the login button not responding on mobile', expected: 'frontend' },
  // --- rambling / filler words
  { text: 'um so basically I am gonna start working on the password reset flow', expected: 'auth' },
  { text: 'yeah so like I am checking the stripe webhook stuff for refunds', expected: 'payments' },
  { text: 'ok so I am sort of tweaking the dashboard layout today', expected: 'frontend' },
  { text: 'uh just adding some tests for the signup endpoint', expected: 'testing' },
  // --- vague
  { text: 'working on some backend stuff for the search', expected: 'backend' },
  { text: 'messing around with the database a bit', expected: 'database' },
  { text: 'doing a bit of cleanup on the frontend', expected: 'frontend' },
  // --- multi-topic (expected = primary activity, judgment call)
  { text: 'starting on the auth tokens and also the new profile page', expected: 'auth' },
  { text: 'writing tests for the payments webhook and the refund flow', expected: 'testing' },
  { text: 'adding the retry column to the payments table and updating the API to use it', expected: 'database' },
  // --- extra coverage
  { text: 'reviewing the two factor authentication flow', expected: 'auth' },
  { text: 'the cart total is showing wrong on the product page', expected: 'frontend' },
  { text: 'setting up fixtures for the integration test suite', expected: 'testing' },
  { text: 'optimizing the slow query on the orders table', expected: 'database' },
  { text: 'adding pagination to the orders list endpoint', expected: 'backend' },
  { text: 'hooking up apple pay in the checkout', expected: 'payments' },
  { text: 'the login screen crashes when the keyboard opens', expected: 'frontend' },
  // --- demo-rehearsal sentences (spoken on camera during M3/M4 testing)
  { text: 'here I want to like check if the front end model is good or not', expected: 'frontend' },
  { text: 'starting on auth refactor, cleaning up the tomen validation logic', expected: 'auth' },
];
