'use strict';

/**
 * Reddit OAuth2 client.
 * Uses the refresh-token grant to obtain short-lived access tokens,
 * then fetches posts from r/collegeresults and r/chanceme.
 *
 * Environment variables required:
 *   REDDIT_CLIENT_ID
 *   REDDIT_CLIENT_SECRET
 *   REDDIT_REFRESH_TOKEN
 */

const axios = require('axios');
const logger = require('./logger');

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';
const USER_AGENT = 'CollegeOS-Scraper/1.0 (+https://github.com/ultramagnus23/CollegeOS)';

// Subreddits to scrape
const SUBREDDITS = ['collegeresults', 'chanceme', 'ApplyingToCollege'];

// Milliseconds to wait between paginated requests to stay under Reddit's
// rate limit (60 requests/minute for OAuth apps).
const REQUEST_DELAY_MS = 1100;

let accessToken = null;
let tokenExpiresAt = 0;

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Obtain a fresh OAuth access token using the stored refresh token.
 */
async function refreshAccessToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const refreshToken = process.env.REDDIT_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Reddit credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and REDDIT_REFRESH_TOKEN.'
    );
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await axios.post(TOKEN_URL, params.toString(), {
    auth: { username: clientId, password: clientSecret },
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const { access_token, expires_in } = response.data;
  if (!access_token) {
    throw new Error('Reddit OAuth token response missing access_token');
  }

  accessToken = access_token;
  // Refresh 60 s before actual expiry to be safe
  tokenExpiresAt = Date.now() + (expires_in - 60) * 1000;
  logger.info('Reddit access token refreshed');
}

/**
 * Return a valid access token, refreshing if necessary.
 * @returns {Promise<string>}
 */
async function getToken() {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    await refreshAccessToken();
  }
  return accessToken;
}

/**
 * Make an authenticated GET request to the Reddit API.
 * Handles 429 rate-limit responses with exponential backoff.
 * @param {string} url
 * @param {object} [params]
 * @returns {Promise<object>}
 */
async function redditGet(url, params = {}) {
  let token = await getToken();
  let attempt = 0;
  const maxAttempts = 5;

  while (attempt < maxAttempts) {
    try {
      const response = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': USER_AGENT,
        },
      });
      return response.data;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '60', 10);
        logger.warn({ msg: 'Reddit rate limited, backing off', retryAfterSeconds: retryAfter });
        await sleep(retryAfter * 1000);
        attempt++;
      } else if (status === 401) {
        // Token expired mid-flight — refresh and update local variable for retry
        await refreshAccessToken();
        token = await getToken();
        attempt++;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Reddit API request failed after ${maxAttempts} attempts: ${url}`);
}

/**
 * Fetch posts from a subreddit listing.
 * @param {string} subreddit
 * @param {'top'|'new'} sort
 * @param {'all'|'year'|'month'|'week'} time  - only used when sort = 'top'
 * @param {number} limit  - max posts per page (Reddit caps at 100)
 * @param {string|null} after  - pagination cursor
 * @returns {Promise<{posts: object[], after: string|null}>}
 */
async function fetchPosts(subreddit, sort, time, limit, after) {
  const params = { limit, raw_json: 1 };
  if (sort === 'top') params.t = time;
  if (after) params.after = after;

  const url = `${API_BASE}/r/${subreddit}/${sort}`;
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
 * Seed mode: scrape as many historical posts as possible from both subreddits,
 * sorted by top-all-time.  Yields batches of posts.
 * @param {number} maxPages  - safety cap on pages per subreddit (0 = unlimited)
 * @yields {{subreddit: string, posts: object[]}}
 */
async function* seedPosts(maxPages = 0) {
  for (const sub of SUBREDDITS) {
    logger.info({ msg: 'Seed: fetching subreddit', subreddit: sub, sort: 'top/all' });
    let after = null;
    let page = 0;

    while (true) {
      if (maxPages > 0 && page >= maxPages) break;

      await sleep(REQUEST_DELAY_MS);
      const { posts, after: nextAfter } = await fetchPosts(sub, 'top', 'all', 100, after);

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
 * Incremental mode: scrape new posts from the last 2 weeks, sorted by new.
 * Stops pagination when it encounters posts older than the cutoff.
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
      const { posts, after: nextAfter } = await fetchPosts(sub, 'new', null, 100, after);

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
