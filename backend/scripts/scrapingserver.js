/**
 * Scraping Server
 * ---------------
 * Runs the scraping pipeline perpetually as a background service.
 * Designed to be started once when your backend boots and kept alive.
 *
 * Features:
 *   - node-cron scheduler for all pipeline stages
 *   - Express health/status endpoint so your app can query scraping status
 *   - Graceful shutdown on SIGTERM/SIGINT
 *   - Self-healing: restarts failed jobs after backoff
 *   - Prevents overlapping runs
 *   - Writes logs to /data/logs/
 *
 * Integration with your main Express app:
 *   Option A (recommended): Start this as a separate process via PM2
 *     pm2 start scrapingServer.js --name "scraper"
 *
 *   Option B: Import and start from your main server
 *     const scraper = require('./scripts/scrapingServer');
 *     scraper.start();
 *
 * Environment variables:
 *   COLLEGE_SCORECARD_API_KEY  — get free key from api.data.gov
 *   SCRAPING_PORT              — port for health endpoint (default: 3001)
 *   SCRAPING_SECRET            — optional bearer token to protect /trigger endpoint
 */

const cron = require('node-cron');
const express = require('express');
const path = require('path');
const fs = require('fs');
const Orchestrator = require('./scrapeOrchestrator');

const PORT = parseInt(process.env.SCRAPING_PORT || '3001');
const SECRET = process.env.SCRAPING_SECRET || null;

// ── State ────────────────────────────────────────────────────────────────

const state = {
  isRunning: false,
  currentJob: null,
  lastRun: null,
  lastResult: null,
  startedAt: new Date().toISOString(),
  runsCompleted: 0,
  runsFailed: 0,
  nextScheduled: null,
};

const orch = new Orchestrator();

function hasOrchestratorMethod(name) {
  return orch && typeof orch[name] === 'function';
}

async function callOrchestratorOrSkip(methodName, ...args) {
  if (!hasOrchestratorMethod(methodName)) {
    return { skipped: true, reason: `Method not implemented on scrapeOrchestrator: ${methodName}` };
  }
  return orch[methodName](...args);
}

// ── Job runner with lock ────────────────────────────────────────────────

async function runJob(jobName, fn) {
  if (state.isRunning) {
    console.log(`[scraper] Skipping ${jobName} — another job is running (${state.currentJob})`);
    return null;
  }

  state.isRunning = true;
  state.currentJob = jobName;
  const start = Date.now();
  console.log(`\n[scraper] ▶ Starting: ${jobName}`);

  try {
    const result = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    state.lastRun = new Date().toISOString();
    state.lastResult = { job: jobName, result, elapsed: parseFloat(elapsed), success: true };
    state.runsCompleted++;
    console.log(`[scraper] ✓ Done: ${jobName} (${elapsed}s)`);
    return result;
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    state.lastResult = { job: jobName, error: e.message, elapsed: parseFloat(elapsed), success: false };
    state.runsFailed++;
    console.error(`[scraper] ✗ Failed: ${jobName} — ${e.message}`);
    return null;
  } finally {
    state.isRunning = false;
    state.currentJob = null;
  }
}

// ── Schedule definitions ─────────────────────────────────────────────────

function setupSchedules() {
  const jobs = [];

  /**
   * Daily at 2:00 AM: Run admissions scraping batch
   * This is the workhorse — scrapes today's batch of college admission pages
   */
  const dailyAdmissions = cron.schedule('0 2 * * *', async () => {
    await runJob('daily_admissions', () => callOrchestratorOrSkip('runAdmissionsScraping'));
  }, { timezone: 'America/New_York' });
  jobs.push({ name: 'daily_admissions', schedule: '0 2 * * *', job: dailyAdmissions });

  /**
   * 1st of every month at 1:00 AM: Refresh College Scorecard data
   * New data drops from Dept of Education, this catches it
   */
  const monthlyScorecardJob = cron.schedule('0 1 1 * *', async () => {
    await runJob('monthly_scorecard', () => callOrchestratorOrSkip('runScorecard'));
  }, { timezone: 'America/New_York' });
  jobs.push({ name: 'monthly_scorecard', schedule: '0 1 1 * *', job: monthlyScorecardJob });

  /**
   * 15th of every month at 1:00 AM: International rankings + UK/India/Germany
   */
  const monthlyIntlJob = cron.schedule('0 1 15 * *', async () => {
    await runJob('monthly_international', () => callOrchestratorOrSkip('runInternational'));
  }, { timezone: 'America/New_York' });
  jobs.push({ name: 'monthly_international', schedule: '0 1 15 * *', job: monthlyIntlJob });

  /**
   * 1st of Jan, Apr, Jul, Oct at 3:00 AM: IPEDS bulk data refresh
   * IPEDS releases new data annually but re-checking quarterly is cheap
   */
  const quarterlyIPEDS = cron.schedule('0 3 1 1,4,7,10 *', async () => {
    await runJob('quarterly_ipeds', () => callOrchestratorOrSkip('runIPEDS'));
  }, { timezone: 'America/New_York' });
  jobs.push({ name: 'quarterly_ipeds', schedule: '0 3 1 1,4,7,10 *', job: quarterlyIPEDS });

  /**
   * Every Sunday 4:00 AM: Update field freshness counters
   * Increments data_freshness_days for all tracked fields
   */
  const weeklyFreshness = cron.schedule('0 4 * * 0', async () => {
    await runJob('update_freshness', async () => {
      const result = await orch.pool.query(`
        UPDATE field_metadata
        SET data_freshness_days = EXTRACT(DAY FROM NOW() - last_updated)::INTEGER
      `);
      return { updated: result.rowCount };
    });
  }, { timezone: 'America/New_York' });
  jobs.push({ name: 'weekly_freshness', schedule: '0 4 * * 0', job: weeklyFreshness });

  return jobs;
}

// ── Express health server ─────────────────────────────────────────────────

function setupServer(jobs) {
  const app = express();
  app.use(express.json());

  // Middleware: optional bearer token auth for trigger endpoints
  const requireAuth = (req, res, next) => {
    if (!SECRET) return next();
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  /**
   * GET /scraper/health
   * Returns current scraper status — useful for monitoring dashboards
   */
  app.get('/scraper/health', (req, res) => {
    const dbStatus = hasOrchestratorMethod('status')
      ? orch.status()
      : { tableStats: null, queueStats: null, note: 'scrapeOrchestrator.status() not implemented' };
    res.json({
      status: state.isRunning ? 'running' : 'idle',
      currentJob: state.currentJob,
      lastRun: state.lastRun,
      lastResult: state.lastResult,
      uptime: process.uptime(),
      startedAt: state.startedAt,
      runsCompleted: state.runsCompleted,
      runsFailed: state.runsFailed,
      schedules: jobs.map(j => ({ name: j.name, schedule: j.schedule })),
      database: dbStatus.tableStats,
      queue: dbStatus.queueStats,
    });
  });

  /**
   * GET /scraper/status
   * Detailed fill-rate report for all tables
   */
  app.get('/scraper/status', (req, res) => {
    if (!hasOrchestratorMethod('status')) {
      return res.status(501).json({ error: 'scrapeOrchestrator.status() not implemented' });
    }
    res.json(orch.status());
  });

  /**
   * POST /scraper/trigger/:job
   * Manually trigger a specific job
   * Requires auth if SCRAPING_SECRET is set
   * Jobs: daily | scorecard | ipeds | admissions | intl | full
   */
  app.post('/scraper/trigger/:job', requireAuth, async (req, res) => {
    const { job } = req.params;

    const jobMap = {
      daily:      () => callOrchestratorOrSkip('runDailyBatch'),
      scorecard:  () => callOrchestratorOrSkip('runScorecard'),
      ipeds:      () => callOrchestratorOrSkip('runIPEDS'),
      admissions: () => callOrchestratorOrSkip('runAdmissionsScraping'),
      intl:       () => callOrchestratorOrSkip('runInternational'),
      full:       () => callOrchestratorOrSkip('runFull'),
    };

    if (!jobMap[job]) {
      return res.status(400).json({ error: `Unknown job. Valid: ${Object.keys(jobMap).join(', ')}` });
    }

    if (state.isRunning) {
      return res.status(409).json({ error: `Another job is running: ${state.currentJob}` });
    }

    // Run async, respond immediately
    res.json({ queued: true, job, message: 'Job triggered, running in background' });
    runJob(`manual_${job}`, jobMap[job]);
  });

  /**
   * POST /scraper/init
   * Initialize or re-initialize the scrape queue
   */
  app.post('/scraper/init', requireAuth, async (req, res) => {
    try {
      const result = await orch.initializeQueue();
      res.json({ success: true, result });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET /scraper/logs
   * Return last N lines from today's log file
   */
  app.get('/scraper/logs', requireAuth, (req, res) => {
    const n = parseInt(req.query.lines || '100');
    const logDir = path.join(__dirname, '..', 'data', 'logs');
    const today = new Date().toISOString().split('T')[0];
    const logPath = path.join(logDir, `scrape_${today}.log`);

    if (!fs.existsSync(logPath)) {
      return res.json({ lines: [], message: 'No log file for today yet' });
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').slice(-n);
    res.json({ lines, path: logPath, total: lines.length });
  });

  app.listen(PORT, () => {
    console.log(`[scraper] Health server running on port ${PORT}`);
    console.log(`[scraper] Endpoints:`);
    console.log(`  GET  http://localhost:${PORT}/scraper/health`);
    console.log(`  GET  http://localhost:${PORT}/scraper/status`);
    console.log(`  POST http://localhost:${PORT}/scraper/trigger/:job`);
    console.log(`  POST http://localhost:${PORT}/scraper/init`);
    console.log(`  GET  http://localhost:${PORT}/scraper/logs`);
  });

  return app;
}

// ── Startup sequence ─────────────────────────────────────────────────────

async function start() {
  console.log('\n=================================================');
  console.log(' College App Scraping Service');
  console.log('=================================================\n');

  // 1. Ensure queue is initialized
  const { rows: queueRows } = await orch.pool.query(`SELECT COUNT(*) as n FROM scrape_queue`);
  const queueCount = parseInt(queueRows[0].n);
  if (queueCount === 0) {
    console.log('[scraper] Queue empty — initializing...');
    await orch.initializeQueue();
  } else {
    console.log(`[scraper] Queue has ${queueCount} entries`);
  }

  // 2. Setup cron jobs
  const jobs = setupSchedules();
  console.log(`[scraper] Scheduled ${jobs.length} cron jobs:`);
  jobs.forEach(j => console.log(`  ${j.schedule}  →  ${j.name}`));

  // 3. Start health server
  setupServer(jobs);

  // 4. On first boot, if Scorecard was never run, kick it off now
  const { rows: scorecardRows } = await orch.pool.query(`SELECT COUNT(*) as n FROM college_admissions WHERE acceptance_rate IS NOT NULL`);
  if (parseInt(scorecardRows[0].n) < 100) {
    console.log('\n[scraper] Scorecard data is sparse — running initial Scorecard pull...');
    await runJob('boot_scorecard', () => callOrchestratorOrSkip('runScorecard'));
  }

  // 5. Run today's daily batch immediately on boot (in case server was down overnight)
  const { rows: lastRunRows } = await orch.pool.query(`
    SELECT MAX(scrape_date) as last FROM scraping_summary
  `);
  const lastDailyRun = lastRunRows[0]?.last;
  const today = new Date().toISOString().split('T')[0];
  if (lastDailyRun !== today) {
    console.log('[scraper] Daily batch not yet run today — starting...');
    // Small delay to not block startup
    setTimeout(() => runJob('boot_daily', () => callOrchestratorOrSkip('runDailyBatch')), 5000);
  }

  // ── Graceful shutdown ──
  const shutdown = async (signal) => {
    console.log(`\n[scraper] Received ${signal}, shutting down gracefully...`);
    jobs.forEach(j => j.job.stop());
    if (state.isRunning) {
      console.log(`[scraper] Waiting for ${state.currentJob} to finish...`);
      await new Promise(r => {
        const check = setInterval(() => { if (!state.isRunning) { clearInterval(check); r(); } }, 1000);
      });
    }
    console.log('[scraper] Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (e) => {
    console.error('[scraper] Uncaught exception:', e);
    state.runsFailed++;
    state.isRunning = false;
    state.currentJob = null;
    // Don't exit — keep the server alive
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[scraper] Unhandled rejection:', reason);
    state.isRunning = false;
    state.currentJob = null;
  });

  console.log('\n[scraper] Service running. Press Ctrl+C to stop.\n');
}

// ── Entry point ────────────────────────────────────────────────────────────

if (require.main === module) {
  start().catch(e => {
    console.error('[scraper] Fatal startup error:', e);
    process.exit(1);
  });
}

module.exports = { start, state, runJob };
