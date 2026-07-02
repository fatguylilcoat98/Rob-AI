/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/**
 * Credential env-var hardening.
 *
 * Provider API keys are read straight from process.env when constructing
 * clients (Anthropic, OpenAI, Groq, Pinecone, Tavily, Supabase, CLASPION…)
 * and many of those values go into an `Authorization: Bearer <key>` header.
 * A stray trailing newline or space in .env — e.g. GROQ_API_KEY="gsk_...\n"
 * (dotenv expands \n inside double quotes into a real newline) — makes the
 * header value illegal and the HTTP client throws before the request is sent.
 *
 * This trims leading/trailing whitespace from credential-looking env vars in
 * place, once, at startup — before any client is constructed — so a config
 * typo can't break request headers again. `trim()` only strips the ends, so
 * multi-line secrets (PEM keys, etc.) keep their internal newlines.
 *
 * Secrets are never logged: only the NAMES of vars that were trimmed appear
 * in the startup log.
 */
'use strict';

// Names that hold credentials destined for HTTP headers / SDK auth.
const CREDENTIAL_NAME = /(_API_KEY|_KEY|_TOKEN|_SECRET|_PASSWORD)$/;

/**
 * Trim whitespace from credential env vars in place.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {string[]} names of the vars that were changed
 */
function sanitizeEnv(env = process.env) {
  const trimmedNames = [];
  for (const name of Object.keys(env)) {
    if (!CREDENTIAL_NAME.test(name)) continue;
    const value = env[name];
    if (typeof value !== 'string') continue;
    const cleaned = value.trim();
    if (cleaned !== value) {
      env[name] = cleaned;
      trimmedNames.push(name);
    }
  }
  if (trimmedNames.length) {
    // Names only — never the secret values.
    console.log(`[ENV] Trimmed stray whitespace from credential vars: ${trimmedNames.join(', ')}`);
  }
  return trimmedNames;
}

module.exports = { sanitizeEnv, CREDENTIAL_NAME };
