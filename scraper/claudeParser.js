'use strict';

/**
 * Claude-powered parser for Reddit admissions posts.
 * Sends post text to Claude and extracts a structured applicant profile
 * plus a list of school outcomes.
 *
 * Environment variable required:
 *   ANTHROPIC_API_KEY
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('./logger');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

const SYSTEM_PROMPT = `You are a structured data extractor for college admissions posts.
Extract information exactly as stated — never guess or infer missing values.
Return ONLY valid JSON, no markdown, no explanation.`;

const USER_PROMPT_TEMPLATE = (postText) => `
Extract admissions data from the following Reddit post.

Return a JSON object with this exact shape:
{
  "applicant": {
    "gpa": <number or null>,
    "sat_score": <integer or null>,
    "act_score": <integer or null>,
    "num_ap_courses": <integer or null>,
    "nationality": <string or null>,
    "intended_major": <string or null>,
    "first_gen": <true, false, or null>,
    "income_bracket": <"<30k" | "30-60k" | "60-110k" | "110-150k" | ">150k" | null>
  },
  "results": [
    {
      "school_name_raw": <string>,
      "outcome": <"accepted" | "rejected" | "waitlisted" | "deferred">,
      "round": <"ED" | "EA" | "RD" | "REA" | "SCEA" | null>
    }
  ]
}

Rules:
- If a field is not clearly stated in the post, set it to null. Never guess.
- "results" must contain every school the applicant mentions with a clear outcome.
- Include only schools with a definitive outcome (accepted/rejected/waitlisted/deferred).
- Omit schools where the outcome is unknown or pending.
- If there are no parseable results, return an empty "results" array.
- Do not include any text outside the JSON object.

POST:
${postText}
`.trim();

/**
 * Parse a Reddit post using Claude.
 * Returns null if parsing fails or the post contains no usable admissions data.
 * @param {object} post  - raw Reddit post data object (fields: id, title, selftext, url)
 * @returns {Promise<{applicant: object, results: object[]}|null>}
 */
async function parsePost(post) {
  const postText = buildPostText(post);
  if (!postText) return null;

  let raw = null;
  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT_TEMPLATE(postText) }],
    });

    raw = message?.content?.[0]?.text || '';
    const parsed = JSON.parse(raw);

    // Basic structural validation
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.results)) return null;
    if (parsed.results.length === 0) return null;

    // Validate each result has required fields
    const validResults = parsed.results.filter((r) => {
      return (
        typeof r.school_name_raw === 'string' &&
        r.school_name_raw.trim().length > 0 &&
        ['accepted', 'rejected', 'waitlisted', 'deferred'].includes(r.outcome)
      );
    });

    if (validResults.length === 0) return null;

    return {
      applicant: sanitizeApplicant(parsed.applicant || {}),
      results: validResults.map(sanitizeResult),
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      logger.warn({ msg: 'Claude returned invalid JSON', postId: post.id, rawLength: raw?.length });
    } else {
      logger.error({ msg: 'Claude API error', postId: post.id, error: err.message });
    }
    return null;
  }
}

/**
 * Build a concise text representation of a Reddit post for the prompt.
 * @param {object} post
 * @returns {string}
 */
function buildPostText(post) {
  const title = (post.title || '').trim();
  const body = (post.selftext || '').trim();
  if (!title && !body) return '';

  // Limit body to 3000 chars to stay within reasonable token budget
  const truncatedBody = body.length > 3000 ? body.slice(0, 3000) + '\n[truncated]' : body;
  return `Title: ${title}\n\n${truncatedBody}`;
}

/**
 * Sanitize applicant fields, coercing types and nulling invalid values.
 * @param {object} raw
 * @returns {object}
 */
function sanitizeApplicant(raw) {
  return {
    gpa: toFloatOrNull(raw.gpa, 0, 5),
    sat_score: toIntOrNull(raw.sat_score, 400, 1600),
    act_score: toIntOrNull(raw.act_score, 1, 36),
    num_ap_courses: toIntOrNull(raw.num_ap_courses, 0, 40),
    nationality: toStringOrNull(raw.nationality),
    intended_major: toStringOrNull(raw.intended_major),
    first_gen: toBoolOrNull(raw.first_gen),
    income_bracket: toIncomeOrNull(raw.income_bracket),
  };
}

/**
 * Sanitize a single school result.
 * @param {object} raw
 * @returns {object}
 */
function sanitizeResult(raw) {
  return {
    school_name_raw: String(raw.school_name_raw).trim(),
    outcome: raw.outcome,
    round: toRoundOrNull(raw.round),
  };
}

// ── Type coercion helpers ────────────────────────────────────────────────────

function toFloatOrNull(val, min, max) {
  const n = parseFloat(val);
  if (isNaN(n) || n < min || n > max) return null;
  return n;
}

function toIntOrNull(val, min, max) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < min || n > max) return null;
  return n;
}

function toStringOrNull(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function toBoolOrNull(val) {
  if (val === true || val === false) return val;
  if (val === null || val === undefined) return null;
  const s = String(val).toLowerCase();
  if (s === 'true' || s === 'yes') return true;
  if (s === 'false' || s === 'no') return false;
  return null;
}

function toIncomeOrNull(val) {
  const valid = ['<30k', '30-60k', '60-110k', '110-150k', '>150k'];
  return valid.includes(val) ? val : null;
}

function toRoundOrNull(val) {
  const valid = ['ED', 'EA', 'RD', 'REA', 'SCEA'];
  return valid.includes(val) ? val : null;
}

module.exports = { parsePost };
