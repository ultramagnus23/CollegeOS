/**
 * Scraping Monitoring Dashboard
 * Generates JSON reports for monitoring scraping health
 */

const path = require('path');
const fs = require('fs');
const dbManager = require('../src/config/database');

class ScrapingMonitor {
  constructor() {
    this.pool = dbManager.getDatabase();
    this.outputDir = path.join(__dirname, '..', 'data', 'monitoring');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate comprehensive monitoring report
   */
  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      queue_status: await this.getQueueStatus(),
      data_freshness: await this.getDataFreshness(),
      success_metrics: await this.getSuccessMetrics(),
      field_completeness: await this.getFieldCompleteness(),
      alerts: await this.checkAlerts(),
      recent_changes: await this.getRecentChanges(50)
    };

    const filename = `scraping_report_${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(this.outputDir, 'latest.json'), JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Queue status
   */
  async getQueueStatus() {
    const { rows: status } = await this.pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(attempts) as avg_attempts
      FROM scrape_queue
      GROUP BY status
    `);

    const total = status.reduce((sum, s) => sum + parseInt(s.count), 0);

    return {
      total,
      by_status: status,
      dead_letter_count: status.find(s => s.status === 'dead_letter')?.count || 0
    };
  }

  /**
   * Data freshness metrics
   */
  async getDataFreshness() {
    const { rows: top1000Rows } = await this.pool.query(`
      SELECT
        AVG(fm.data_freshness_days) as avg_freshness,
        MAX(fm.data_freshness_days) as max_freshness,
        COUNT(DISTINCT fm.college_id) as colleges_tracked
      FROM field_metadata fm
      JOIN colleges c ON c.id = fm.college_id
      WHERE c.ranking <= 1000
    `);

    const { rows: allRows } = await this.pool.query(`
      SELECT
        AVG(data_freshness_days) as avg_freshness,
        MAX(data_freshness_days) as max_freshness,
        COUNT(DISTINCT college_id) as colleges_tracked
      FROM field_metadata
    `);

    return {
      top_1000: top1000Rows[0],
      all_colleges: allRows[0]
    };
  }

  /**
   * Success metrics
   */
  async getSuccessMetrics() {
    const { rows: last7Days } = await this.pool.query(`
      SELECT
        scrape_date,
        colleges_scraped,
        colleges_succeeded,
        colleges_failed,
        ROUND(CAST(colleges_succeeded AS FLOAT) / NULLIF(colleges_scraped, 0) * 100, 2) as success_rate,
        avg_confidence_score
      FROM scrape_statistics
      WHERE scrape_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY scrape_date DESC
    `);

    const avgSuccessRate = last7Days.reduce((sum, d) => sum + (parseFloat(d.success_rate) || 0), 0) / (last7Days.length || 1);
    const avgConfidence = last7Days.reduce((sum, d) => sum + (parseFloat(d.avg_confidence_score) || 0), 0) / (last7Days.length || 1);

    return {
      last_7_days: last7Days,
      avg_success_rate: Math.round(avgSuccessRate * 100) / 100,
      avg_confidence: Math.round(avgConfidence * 100) / 100
    };
  }

  /**
   * Field completeness heatmap
   */
  async getFieldCompleteness() {
    const fields = [
      'acceptance_rate', 'tuition_domestic', 'gpa_50', 'graduation_rate_4yr',
      'founding_year', 'campus_size_acres', 'religious_affiliation', 'test_optional_flag',
      'percent_international', 'median_debt', 'housing_guarantee'
    ];

    const completeness = {};
    const { rows: totalRows } = await this.pool.query('SELECT COUNT(*) as count FROM colleges');
    const totalColleges = parseInt(totalRows[0].count);

    for (const field of fields) {
      const { rows } = await this.pool.query(`
        SELECT COUNT(*) as populated
        FROM colleges
        WHERE ${field} IS NOT NULL
      `);
      const populated = parseInt(rows[0].populated);
      completeness[field] = {
        populated,
        percentage: Math.round((populated / totalColleges) * 100)
      };
    }

    return completeness;
  }

  /**
   * Check for alerts
   */
  async checkAlerts() {
    const alerts = [];

    const { rows: recentRows } = await this.pool.query(`
      SELECT AVG(CAST(colleges_succeeded AS FLOAT) / NULLIF(colleges_scraped, 0)) as success_rate
      FROM scrape_statistics
      WHERE scrape_date >= CURRENT_DATE - INTERVAL '1 day'
    `);
    const recentStats = recentRows[0];

    if (recentStats.success_rate !== null) {
      const rate = parseFloat(recentStats.success_rate);
      if (rate < 0.70) {
        alerts.push({ level: 'critical', message: `Success rate below 70%: ${Math.round(rate * 100)}%` });
      } else if (rate < 0.85) {
        alerts.push({ level: 'warning', message: `Success rate below 85%: ${Math.round(rate * 100)}%` });
      }
    }

    const { rows: backlogRows } = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM scrape_queue
      WHERE status = 'pending' AND scheduled_for::date < CURRENT_DATE
    `);
    const backlogCount = parseInt(backlogRows[0].count);
    if (backlogCount > 500) {
      alerts.push({ level: 'warning', message: `Queue backlog: ${backlogCount} colleges overdue` });
    }

    const { rows: deadLetterRows } = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM scrape_queue
      WHERE status = 'dead_letter'
    `);
    const deadLetterCount = parseInt(deadLetterRows[0].count);
    if (deadLetterCount > 50) {
      alerts.push({ level: 'warning', message: `Dead letter queue: ${deadLetterCount} colleges need manual review` });
    }

    const { rows: staleRows } = await this.pool.query(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM colleges c
      LEFT JOIN field_metadata fm ON fm.college_id = c.id
      WHERE c.ranking <= 100
        AND (fm.data_freshness_days > 21 OR fm.data_freshness_days IS NULL)
    `);
    const staleCount = parseInt(staleRows[0].count);
    if (staleCount > 0) {
      alerts.push({ level: 'warning', message: `${staleCount} top-100 colleges have stale data (>21 days)` });
    }

    return alerts;
  }

  /**
   * Get recent changes
   */
  async getRecentChanges(limit = 50) {
    const { rows } = await this.pool.query(`
      SELECT
        sal.scraped_at,
        c.name as college_name,
        sal.field_name,
        sal.old_value,
        sal.new_value,
        sal.confidence_score,
        sal.source
      FROM scrape_audit_log sal
      JOIN colleges c ON c.id = sal.college_id
      ORDER BY sal.scraped_at DESC
      LIMIT $1
    `, [limit]);
    return rows;
  }

  /**
   * Export daily metrics for ML
   */
  async exportMLDataset() {
    const today = new Date().toISOString().split('T')[0];
    const mlDir = path.join(__dirname, '..', 'data', 'ml_datasets', 'colleges');

    if (!fs.existsSync(mlDir)) {
      fs.mkdirSync(mlDir, { recursive: true });
    }

    const { rows: colleges } = await this.pool.query(`
      SELECT
        c.*,
        (SELECT AVG(confidence_score) FROM field_metadata WHERE college_id = c.id) as overall_confidence,
        (SELECT COUNT(DISTINCT field_name) FROM field_metadata WHERE college_id = c.id) as fields_populated_count
      FROM colleges c
    `);

    const filename = `${today}.json`;
    const filepath = path.join(mlDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(colleges, null, 2));

    console.log(`ML dataset exported: ${filepath}`);
    console.log(`Total colleges: ${colleges.length}`);

    return filepath;
  }
}

// Export for use in other scripts
module.exports = ScrapingMonitor;

// CLI usage
if (require.main === module) {
  async function run() {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
    dbManager.initialize();
    const monitor = new ScrapingMonitor();
    const command = process.argv[2] || 'report';

    switch (command) {
      case 'report': {
        const report = await monitor.generateReport();
        console.log('Monitoring report generated');
        console.log(`Alerts: ${report.alerts.length}`);
        console.log(`Success rate (7d avg): ${report.success_metrics.avg_success_rate}%`);
        break;
      }
      case 'ml-export':
        await monitor.exportMLDataset();
        break;
      default:
        console.log('Usage: node scrapingMonitor.js [report|ml-export]');
    }
    await dbManager.close();
  }
  run().catch(e => {
    console.error('[monitor] Fatal error:', e);
    process.exit(1);
  });
}
