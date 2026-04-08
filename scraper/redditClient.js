'use strict';

// Auth-free — uses Reddit public JSON API, no credentials needed

/**
 * Reddit public JSON API client.
 * Fetches posts from r/collegeresults, r/chanceme, and r/ApplyingToCollege
 * using Reddit's unauthenticated search endpoint — no OAuth or credentials required.
 */

const axios = require('axios');
const logger = require('./logger');

const API_BASE = 'https://www.reddit.com';
const USER_AGENT = 'CollegeOS/1.0';

// Subreddits to scrape
const SUBREDDITS = ['collegeresults', 'chanceme', 'ApplyingToCollege'];

// Milliseconds to wait between paginated requests to stay under Reddit's rate limit.
const REQUEST_DELAY_MS = 1100;

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make a GET request to the Reddit public JSON API.
 * Handles 429 rate-limit responses with a 60-second back-off.
 * @param {string} url
 * @param {object} [params]
 * @returns {Promise<object>}
 */
async function redditGet(url, params = {}) {
  let attempt = 0;
  const maxAttempts = 5;

  while (attempt < maxAttempts) {
    try {
      const response = await axios.get(url, {
        params,
        headers: { 'User-Agent': USER_AGENT },
      });
      return response.data;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '60', 10);
        logger.warn({ msg: 'Reddit rate limited, backing off', retryAfterSeconds: retryAfter });
        await sleep(retryAfter * 1000);
        attempt++;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Reddit API request failed after ${maxAttempts} attempts: ${url}`);
}

/**
 * Search a subreddit for posts matching `query`.
 * @param {string} subreddit
 * @param {string} query
 * @param {number} limit  - max posts per page (Reddit caps at 100)
 * @param {string|null} after  - pagination cursor
 * @returns {Promise<{posts: object[], after: string|null}>}
 */
async function fetchPosts(subreddit, query, limit, after) {
  const params = {
    q: query,
    sort: 'relevance',
    t: 'all',
    limit,
    restrict_sr: 1,
    raw_json: 1,
  };
  if (after) params.after = after;

  const url = `${API_BASE}/r/${subreddit}/search.json`;
  const data = await redditGet(url, params);

  const children = data?.data?.children || [];
  const posts = children
    .filter((c) => c.kind === 't3' && !c.data.stickied)
    .map((c) => c.data);

  return {
    posts,
    after: data?.data?.after || null,
  };
}

/**
 * Seed mode: scrape as many historical posts as possible from all subreddits.
 * Yields batches of posts.
 * @param {number} maxPages  - safety cap on pages per subreddit (0 = unlimited)
 * @yields {{subreddit: string, posts: object[]}}
 */
async function* seedPosts(maxPages = 0) {
  for (const sub of SUBREDDITS) {
    logger.info({ msg: 'Seed: fetching subreddit', subreddit: sub });
    let after = null;
    let page = 0;

    while (true) {
      if (maxPages > 0 && page >= maxPages) break;

      await sleep(REQUEST_DELAY_MS);
      const { posts, after: nextAfter } = await fetchPosts(sub, 'chance me OR results', 100, after);

      if (posts.length === 0) break;
      yield { subreddit: sub, posts };

      logger.info({ msg: 'Seed page fetched', subreddit: sub, page: page + 1, count: posts.length });

      if (!nextAfter) break;
      after = nextAfter;
      page++;
    }
  }
}

/**
 * Incremental mode: scrape new posts, stopping when posts older than `since` are encountered.
 * @param {Date} since  - only return posts newer than this date
 * @yields {{subreddit: string, posts: object[]}}
 */
async function* incrementalPosts(since) {
  const sinceTs = Math.floor(since.getTime() / 1000);

  for (const sub of SUBREDDITS) {
    logger.info({ msg: 'Incremental: fetching new posts', subreddit: sub, since: since.toISOString() });
    let after = null;
    let done = false;

    while (!done) {
      await sleep(REQUEST_DELAY_MS);
      const { posts, after: nextAfter } = await fetchPosts(sub, 'chance me OR results', 100, after);

      if (posts.length === 0) break;

      const filtered = posts.filter((p) => p.created_utc >= sinceTs);
      if (filtered.length > 0) {
        yield { subreddit: sub, posts: filtered };
      }

      // If the oldest post in this page is already before our cutoff, stop
      const oldest = posts[posts.length - 1];
      if (oldest.created_utc < sinceTs || !nextAfter) {
        done = true;
      }
      after = nextAfter;
    }
  }
}

module.exports = { seedPosts, incrementalPosts };
