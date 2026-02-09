/**
 * Scraping Monitoring Dashboard
 * Generates JSON reports for monitoring scraping health
 */

const path = require('path');
const fs = require('fs');
const dbManager = require('../src/config/database');

class ScrapingMonitor {
  constructor() {
    this.db = dbManager.getDatabase();
    this.outputDir = path.join(__dirname, '..', 'data', 'monitoring');
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate comprehensive monitoring report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      queue_status: this.getQueueStatus(),
      data_freshness: this.getDataFreshness(),
      success_metrics: this.getSuccessMetrics(),
      field_completeness: this.getFieldCompleteness(),
      alerts: this.checkAlerts(),
      recent_changes: this.getRecentChanges(50)
    };

    // Save to file
    const filename = `scraping_report_${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

    // Also save as latest
    fs.writeFileSync(path.join(this.outputDir, 'latest.json'), JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Queue status
   */
  getQueueStatus() {
    const status = this.db.prepare(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(attempts) as avg_attempts
      FROM scrape_queue
      GROUP BY status
    `).all();

    const total = status.reduce((sum, s) => sum + s.count, 0);

    return {
      total,
      by_status: status,
      dead_letter_count: status.find(s => s.status === 'dead_letter')?.count || 0
    };
  }

  /**
   * Data freshness metrics
   */
  getDataFreshness() {
    const top1000 = this.db.prepare(`
      SELECT 
        AVG(fm.data_freshness_days) as avg_freshness,
        MAX(fm.data_freshness_days) as max_freshness,
        COUNT(DISTINCT fm.college_id) as colleges_tracked
      FROM field_metadata fm
      JOIN colleges c ON c.id = fm.college_id
      WHERE c.ranking <= 1000
    `).get();

    const all = this.db.prepare(`
      SELECT 
        AVG(data_freshness_days) as avg_freshness,
        MAX(data_freshness_days) as max_freshness,
        COUNT(DISTINCT college_id) as colleges_tracked
      FROM field_metadata
    `).get();

    return {
      top_1000: top1000,
      all_colleges: all
    };
  }

  /**
   * Success metrics
   */
  getSuccessMetrics() {
    const last7Days = this.db.prepare(`
      SELECT 
        scrape_date,
        colleges_scraped,
        colleges_succeeded,
        colleges_failed,
        ROUND(CAST(colleges_succeeded AS FLOAT) / NULLIF(colleges_scraped, 0) * 100, 2) as success_rate,
        avg_confidence_score
      FROM scrape_statistics
      WHERE scrape_date >= DATE('now', '-7 days')
      ORDER BY scrape_date DESC
    `).all();

    const avgSuccessRate = last7Days.reduce((sum, d) => sum + (d.success_rate || 0), 0) / (last7Days.length || 1);
    const avgConfidence = last7Days.reduce((sum, d) => sum + (d.avg_confidence_score || 0), 0) / (last7Days.length || 1);

    return {
      last_7_days: last7Days,
      avg_success_rate: Math.round(avgSuccessRate * 100) / 100,
      avg_confidence: Math.round(avgConfidence * 100) / 100
    };
  }

  /**
   * Field completeness heatmap
   */
  getFieldCompleteness() {
    const fields = [
      'acceptance_rate', 'tuition_domestic', 'gpa_50', 'graduation_rate_4yr',
      'founding_year', 'campus_size_acres', 'religious_affiliation', 'test_optional_flag',
      'percent_international', 'median_debt', 'housing_guarantee'
    ];

    const completeness = {};
    const totalColleges = this.db.prepare('SELECT COUNT(*) as count FROM colleges').get().count;

    for (const field of fields) {
      const result = this.db.prepare(`
        SELECT COUNT(*) as populated
        FROM colleges
        WHERE ${field} IS NOT NULL
      `).get();
      
      completeness[field] = {
        populated: result.populated,
        percentage: Math.round((result.populated / totalColleges) * 100)
      };
    }

    return completeness;
  }

  /**
   * Check for alerts
   */
  checkAlerts() {
    const alerts = [];

    // Check success rate
    const recentStats = this.db.prepare(`
      SELECT AVG(CAST(colleges_succeeded AS FLOAT) / NULLIF(colleges_scraped, 0)) as success_rate
      FROM scrape_statistics
      WHERE scrape_date >= DATE('now', '-1 day')
    `).get();

    if (recentStats.success_rate < 0.70) {
      alerts.push({
        level: 'critical',
        message: `Success rate below 70%: ${Math.round(recentStats.success_rate * 100)}%`
      });
    } else if (recentStats.success_rate < 0.85) {
      alerts.push({
        level: 'warning',
        message: `Success rate below 85%: ${Math.round(recentStats.success_rate * 100)}%`
      });
    }

    // Check queue backlog
    const backlog = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM scrape_queue
      WHERE status = 'pending' AND DATE(scheduled_for) < DATE('now')
    `).get();

    if (backlog.count > 500) {
      alerts.push({
        level: 'warning',
        message: `Queue backlog: ${backlog.count} colleges overdue`
      });
    }

    // Check dead letter queue
    const deadLetter = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM scrape_queue
      WHERE status = 'dead_letter'
    `).get();

    if (deadLetter.count > 50) {
      alerts.push({
        level: 'warning',
        message: `Dead letter queue: ${deadLetter.count} colleges need manual review`
      });
    }

    // Check stale top colleges
    const staleTop = this.db.prepare(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM colleges c
      LEFT JOIN field_metadata fm ON fm.college_id = c.id
      WHERE c.ranking <= 100
        AND (fm.data_freshness_days > 21 OR fm.data_freshness_days IS NULL)
    `).get();

    if (staleTop.count > 0) {
      alerts.push({
        level: 'warning',
        message: `${staleTop.count} top-100 colleges have stale data (>21 days)`
      });
    }

    return alerts;
  }

  /**
   * Get recent changes
   */
  getRecentChanges(limit = 50) {
    return this.db.prepare(`
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
      LIMIT ?
    `).all(limit);
  }

  /**
   * Export daily metrics for ML
   */
  exportMLDataset() {
    const today = new Date().toISOString().split('T')[0];
    const mlDir = path.join(__dirname, '..', 'data', 'ml_datasets', 'colleges');
    
    if (!fs.existsSync(mlDir)) {
      fs.mkdirSync(mlDir, { recursive: true });
    }

    // Get all colleges with their latest data and metadata
    const colleges = this.db.prepare(`
      SELECT 
        c.*,
        (SELECT AVG(confidence_score) FROM field_metadata WHERE college_id = c.id) as overall_confidence,
        (SELECT COUNT(DISTINCT field_name) FROM field_metadata WHERE college_id = c.id) as fields_populated_count
      FROM colleges c
    `).all();

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
  const monitor = new ScrapingMonitor();
  
  const command = process.argv[2] || 'report';
  
  switch(command) {
    case 'report':
      const report = monitor.generateReport();
      console.log('Monitoring report generated');
      console.log(`Alerts: ${report.alerts.length}`);
      console.log(`Success rate (7d avg): ${report.success_metrics.avg_success_rate}%`);
      break;
    case 'ml-export':
      monitor.exportMLDataset();
      break;
    default:
      console.log('Usage: node scrapingMonitor.js [report|ml-export]');
  }
}
