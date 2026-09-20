/**
 * Prompt construction for the on-device LLM (Qwen2.5-0.5B-Instruct).
 *
 * We format prompts with Qwen's own ChatML template - the special tokens
 * <|im_start|> / <|im_end|> that the model was actually trained on - rather
 * than the PRD sketch's plain "System: / User: / Assistant:" text labels.
 * Key differences and why:
 *   1. Turn boundaries are real special tokens, so a 0.5B model reliably
 *      understands where instructions end and the answer begins.
 *   2. <|im_end|> doubles as Qwen's end-of-turn token, so we also pass it as
 *      a stop sequence - generation ends cleanly instead of rambling to the
 *      n_predict cap like the PRD sketch would.
 *
 * M4 (PRD 3.4 + build order step 4): few-shot examples added, because tiny
 * models need the pattern SHOWN, not described. Design notes:
 *   - 5 examples across 5 different scopes (auth, backend, database,
 *     payments, frontend), deliberately covering the two boundaries the M3
 *     baseline got wrong (rate limiter -> backend, table index -> database).
 *   - Every example keeps summary ~3-5 words and rationale ~8-12 words to
 *     TEACH brevity: the M3 token-limit failures came from verbose
 *     rationales, and the grammar cannot fix verbosity - examples can.
 *   - One example contains filler words ("um so basically") to show that
 *     rambling STT input is classified the same way.
 *   - The few-shot assistant turns are STATIC text; the GBNF grammar from
 *     grammar.ts still constrains only the final generated turn.
 *
 * Matches the verified official template in
 * Qwen/Qwen2.5-0.5B-Instruct-GGUF (no tools section needed for us).
 */

export const IM_START = '<|im_start|>';
export const IM_END = '<|im_end|>';

/** PRD 3.4 system message, verbatim. */
export const SYSTEM_PROMPT =
  'You extract structured intent from a developer\u2019s spoken update. ' +
  'Output only valid JSON matching the schema. ' +
  'scope must be one of: auth, payments, frontend, backend, database, testing.';

type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string };

type Example = { user: string; assistant: string };

/**
 * PRD 3.4's example first, then 4 more chosen to fix observed M3 failures
 * and cover the remaining scopes. Keep summaries/rationales terse - this
 * style is what the model imitates.
 */
const FEW_SHOT_EXAMPLES: Example[] = [
  {
    user: 'starting on the auth refactor, cleaning up the token validation logic',
    assistant:
      '{"scope": "auth", "summary": "Refactoring auth module", "rationale": "Cleaning up token validation logic"}',
  },
  {
    user: 'adding a rate limiter to the API endpoints',
    assistant:
      '{"scope": "backend", "summary": "Adding rate limiter to API", "rationale": "Protect endpoints from excessive traffic"}',
  },
  {
    user: 'adding an index to the users table',
    assistant:
      '{"scope": "database", "summary": "Index users table", "rationale": "Speed up queries on the users table"}',
  },
  {
    user: 'updating the checkout to support card payments',
    assistant:
      '{"scope": "payments", "summary": "Adding card payments to checkout", "rationale": "Extend checkout flow for card support"}',
  },
  {
    user: 'um so basically I\u2019m building the new profile settings screen',
    assistant:
      '{"scope": "frontend", "summary": "Building profile settings screen", "rationale": "New UI screen for profile settings"}',
  },
];

/** Render one turn exactly the way Qwen2.5 was trained on (ChatML). */
function renderTurn(turn: ChatTurn): string {
  return `${IM_START}${turn.role}\n${turn.content}${IM_END}\n`;
}

/**
 * Build the full ChatML prompt for a spoken transcript.
 * opts.fewShot = false reproduces the M3 baseline (system + user only) so
 * the test harness can A/B the prompt. Default true (the M4 prompt).
 * M4 iteration rule: only edit SYSTEM_PROMPT / FEW_SHOT_EXAMPLES here -
 * the output contract lives in grammar.ts and must not change.
 */
export function buildPrompt(
  transcript: string,
  opts: { fewShot?: boolean } = {},
): string {
  const turns: ChatTurn[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (opts.fewShot !== false) {
    for (const ex of FEW_SHOT_EXAMPLES) {
      turns.push({ role: 'user', content: ex.user });
      turns.push({ role: 'assistant', content: ex.assistant });
    }
  }
  turns.push({ role: 'user', content: transcript });
  return turns.map(renderTurn).join('') + `${IM_START}assistant\n`;
}

