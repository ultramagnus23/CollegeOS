/**
 * Values Engine Service
 *
 * Calls the OpenAI API to produce a structured psychological "values vector"
 * from a student's free-text answers about why college matters to them and their
 * life goals.
 *
 * Uses axios (already in backend dependencies) instead of the OpenAI SDK so
 * no new package is required.
 *
 * Model: gpt-4o-mini
 *
 * Returns:
 *   {
 *     dimensions: { [dimensionName]: { score: 0-10, evidence: string|null } },
 *     dominant_values: string[],   // dimensions that scored >= 7
 *     summary: string              // 2 plain-English sentences
 *   }
 * or null if both inputs are empty / on error.
 */

'use strict';

const axios = require('axios');
const logger = require('../utils/logger');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a psychological profiling engine for a college admissions platform. Read a student's free-text answer about why college matters to them and their life goals, and score them on exactly 10 dimensions. Return ONLY valid JSON. No markdown, no preamble, no text outside the JSON object.

The 10 dimensions are:
- entrepreneurship: wants to start companies, build products, be their own boss
- research: wants to push knowledge forward, work in labs, do a PhD, think deeply
- social_impact: wants to fix systems, help communities, reduce inequality, work in policy or development
- prestige_career: values brand name, wants top recruiters, consulting/finance/big tech, status matters
- creative_expression: values arts, film, writing, design, music, cultural vibrancy
- community_belonging: wants close-knit community, values friendship, warmth, sports culture, college life
- global_exposure: wants to meet people from everywhere, travel, study abroad, build global network
- academic_freedom: doesn't want to be locked into a major, wants to explore broadly, design own curriculum
- financial_pragmatism: explicit about ROI, salary, paying off loans, family obligations, value for money
- personal_growth: wants to figure out who they are, therapy/wellness, spiritual development, reflection

For each dimension provide:
- score: integer 0-10 (0 = completely absent, 10 = primary explicit motivation)
- evidence: a direct phrase from the student's actual text that justifies the score, or null if score is 0

Rules:
- Scores should be honest, not inflated. Most students score high on 2-3 dimensions and zero on several others.
- Do not project values the student did not express.
- The evidence field must be a direct phrase from the student's actual words, not a paraphrase.

Return format:
{
  "dimensions": {
    "entrepreneurship": { "score": 0, "evidence": null },
    "research": { "score": 8, "evidence": "direct quote from text" },
    ...all 10 dimensions...
  },
  "dominant_values": ["research", "social_impact"],
  "summary": "Two plain English sentences describing this student's core motivation."
}`;

/**
 * Compute a values vector from the student's free-text answers.
 *
 * @param {string|null} whyCollegeMatters  - student's answer to "why college matters"
 * @param {string|null} lifeGoalsRaw       - student's raw life goals text
 * @returns {Promise<Object|null>}
 */
async function computeValuesVector(whyCollegeMatters, lifeGoalsRaw) {
  const text1 = (whyCollegeMatters || '').trim();
  const text2 = (lifeGoalsRaw || '').trim();

  if (!text1 && !text2) {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not set — skipping values vector computation');
    return null;
  }

  const userMessage = [
    'Why college matters to me:',
    text1 || '(not provided)',
    '',
    'My life goals:',
    text2 || '(not provided)',
  ].join('\n');

  try {
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const rawText = response.data?.choices?.[0]?.message?.content;
    if (!rawText) {
      logger.error('valuesEngine: empty response from OpenAI', { response: response.data });
      return null;
    }

    // Strip any accidental markdown fences
    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(jsonText);

    // Validate structure
    if (!parsed.dimensions || !parsed.dominant_values || !parsed.summary) {
      logger.error('valuesEngine: unexpected response shape', { parsed });
      return null;
    }

    return parsed;
  } catch (err) {
    if (err.name === 'SyntaxError') {
      logger.error('valuesEngine: JSON parse failed', { error: err.message });
    } else {
      logger.error('valuesEngine: OpenAI API call failed', {
        error: err?.response?.data || err?.message,
      });
    }
    return null;
  }
}

module.exports = { computeValuesVector };
