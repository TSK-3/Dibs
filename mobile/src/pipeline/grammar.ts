/**
 * Grammar-constrained decoding (PRD 3.3) - the single highest-value piece
 * of this pipeline.
 *
 * The GBNF grammar below makes the model STRUCTURALLY incapable of emitting
 * invalid output: llama.cpp only allows tokens that keep the text a valid
 * instance of our schema, and it rejects EOS mid-object so we never get a
 * truncated JSON.
 *
 * SCOPE_ENUM is the single source of truth: the grammar's `scope` rule is
 * GENERATED from it. When Karthik confirms the backend enum, this is the
 * one array you edit - the grammar updates itself.
 *
 * API check: llama.rn 0.12.9 supports this exactly as the PRD shows -
 * `completion({ grammar })` takes a raw GBNF string (verified in the
 * package's own types.ts; it also has a `json_schema` option we deliberately
 * don't use because the PRD specifies GBNF).
 */

/** The scope enum - PRD 3.3. Confirm with Karthik before the demo. */
export const SCOPE_VALUES = [
  'auth',
  'payments',
  'frontend',
  'backend',
  'database',
  'testing',
] as const;

export type Scope = (typeof SCOPE_VALUES)[number];

/** The exact object shape we hand to Tejashwin's app. */
export type Intent = {
  scope: Scope;
  summary: string;
  rationale: string;
};

/** The `scope ::= ...` rule, generated FROM the enum above.
 * Each alternative is a GBNF string literal whose contents are the escaped
 * enum value, e.g. "\"auth\"" - which matches the JSON output `"auth"`. */
const scopeRule = `scope ::= ${SCOPE_VALUES.map((s) => `"\\"${s}\\""`).join(' | ')}`;

/**
 * PRD 3.3 grammar, verbatim, except the scope rule which is generated from
 * SCOPE_VALUES. Key order (scope, summary, rationale) and "exactly these
 * three fields" are enforced structurally.
 */
export const GBNF_GRAMMAR = [
  'root ::= "{" ws "\\"scope\\":" ws scope "," ws "\\"summary\\":" ws string "," ws "\\"rationale\\":" ws string ws "}"',
  scopeRule,
  'string ::= "\\"" ([^"\\\\] | "\\\\" .)* "\\""',
  'ws ::= [ \\t\\n]*',
].join('\n');

export type ParseResult =
  | { ok: true; intent: Intent }
  | { ok: false; error: string };

/**
 * Parse and validate the model output against the SAME schema the grammar
 * enforces. With the grammar active, failures here should be near-impossible
 * - which is exactly why this is a cheap, honest assertion rather than a
 * repair step. (M5's fallback chain hooks in if it ever does fail.)
 */
export function parseIntent(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (err) {
    return {
      ok: false,
      error: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Output is not a JSON object' };
  }

  const keys = Object.keys(parsed).sort();
  const expected = ['rationale', 'scope', 'summary'];
  if (keys.join(',') !== expected.join(',')) {
    return {
      ok: false,
      error: `Expected exactly {scope, summary, rationale}, got: ${keys.join(', ')}`,
    };
  }

  const { scope, summary, rationale } = parsed as Record<string, unknown>;
  if (typeof scope !== 'string' || !(SCOPE_VALUES as readonly string[]).includes(scope)) {
    return {
      ok: false,
      error: `scope "${String(scope)}" is not one of: ${SCOPE_VALUES.join(', ')}`,
    };
  }
  if (typeof summary !== 'string' || typeof rationale !== 'string') {
    return { ok: false, error: 'summary and rationale must be strings' };
  }

  return {
    ok: true,
    intent: { scope: scope as Scope, summary, rationale },
  };
}
