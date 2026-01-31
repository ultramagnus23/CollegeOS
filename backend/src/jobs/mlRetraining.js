// backend/src/jobs/mlRetraining.js
// Automated ML model retraining scheduler

const cron = require('node-cron');
const dbManager = require('../config/database');
const mlPredictionService = require('../services/mlPredictionService');
const logger = require('../utils/logger');

class MLRetrainingJob {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
    this.lastRunStats = null;
  }

  /**
   * Start all ML-related scheduled jobs
   */
  start() {
    // Monthly model retraining - runs at 3 AM on the 1st of each month
    this.jobs.push(
      cron.schedule('0 3 1 * *', async () => {
        logger.info('Monthly ML model retraining starting...');
        await this.runRetrainingCycle();
      })
    );

    // Weekly data quality check - runs every Sunday at 2 AM
    this.jobs.push(
      cron.schedule('0 2 * * 0', async () => {
        logger.info('Weekly ML data quality check starting...');
        await this.checkDataQuality();
      })
    );

    // Daily check for colleges ready for first-time training - runs at 4 AM
    this.jobs.push(
      cron.schedule('0 4 * * *', async () => {
        logger.info('Daily new model training check starting...');
        await this.checkNewModelsReady();
      })
    );

    logger.info('ML retraining jobs scheduled');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    logger.info('ML retraining jobs stopped');
  }

  /**
   * Run a model retraining cycle
   */
  async runRetrainingCycle() {
    if (this.isRunning) {
      logger.warn('Retraining cycle already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const stats = {
      startedAt: new Date().toISOString(),
      collegesChecked: 0,
      collegesRetrained: 0,
      collegesFailed: 0,
      details: []
    };

    try {
      // Check if ML service is available
      const isAvailable = await mlPredictionService.isAvailable();
      if (!isAvailable) {
        logger.warn('ML service not available, skipping retraining cycle');
        this.isRunning = false;
        return;
      }

      const db = dbManager.getDatabase();

      // Get colleges with sufficient data
      const collegesWithData = db.prepare(`
        SELECT 
          college_id,
          COUNT(*) as total_samples,
          SUM(CASE WHEN decision = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
          SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
          MAX(created_at) as latest_data
        FROM ml_training_data
        WHERE decision IN ('accepted', 'rejected')
        GROUP BY college_id
        HAVING total_samples >= 30
          AND accepted_count >= 10
          AND rejected_count >= 10
        ORDER BY total_samples DESC
        LIMIT 50
      `).all();

      stats.collegesChecked = collegesWithData.length;

      for (const college of collegesWithData) {
        try {
          // Check if model needs retraining
          const modelInfo = await mlPredictionService.getModelInfo(college.college_id);
          
          let needsRetraining = false;
          let reason = '';

          if (!modelInfo) {
            needsRetraining = true;
            reason = 'No existing model';
          } else {
            const trainedAt = new Date(modelInfo.trained_at);
            const daysSinceTraining = (Date.now() - trainedAt.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceTraining >= 30) {
              needsRetraining = true;
              reason = `Model is ${Math.floor(daysSinceTraining)} days old`;
            } else if (college.total_samples > modelInfo.sample_count * 1.2) {
              needsRetraining = true;
              reason = `Significant new data (${college.total_samples} vs ${modelInfo.sample_count})`;
            }
          }

          if (needsRetraining) {
            // Get training data
            const trainingData = db.prepare(`
              SELECT * FROM ml_training_data
              WHERE college_id = ?
                AND decision IN ('accepted', 'rejected')
                AND (confidence_score >= 0.5 OR confidence_score IS NULL)
            `).all(college.college_id);

            // Request training from ML service
            const result = await mlPredictionService.trainModel(
              college.college_id,
              trainingData,
              true  // force retrain
            );

            if (result.success) {
              stats.collegesRetrained++;
              
              // Log to training history
              db.prepare(`
                INSERT INTO model_training_history 
                (college_id, model_version, trigger_type, samples_used, accuracy_after, success)
                VALUES (?, ?, 'scheduled', ?, ?, 1)
              `).run(
                college.college_id,
                result.version || '1.0',
                college.total_samples,
                result.metrics?.accuracy || null
              );
            } else {
              stats.collegesFailed++;
            }

            stats.details.push({
              collegeId: college.college_id,
              reason: reason,
              success: result.success,
              message: result.message
            });
          }

        } catch (error) {
          stats.collegesFailed++;
          stats.details.push({
            collegeId: college.college_id,
            success: false,
            error: error.message
          });
          logger.error(`Retraining failed for college ${college.college_id}:`, error.message);
        }
      }

      stats.completedAt = new Date().toISOString();
      this.lastRunStats = stats;

      logger.info(`Retraining cycle complete: ${stats.collegesRetrained} models retrained, ${stats.collegesFailed} failed`);

    } catch (error) {
      logger.error('Retraining cycle failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check data quality and flag suspicious entries
   */
  async checkDataQuality() {
    try {
      const db = dbManager.getDatabase();

      // Flag records with suspicious data patterns
      const suspiciousUpdates = [];

      // Flag very low GPAs with very high test scores
      const suspicious1 = db.prepare(`
        UPDATE ml_training_data
        SET confidence_score = confidence_score * 0.5
        WHERE gpa < 2.0 AND sat_total > 1500
          AND confidence_score > 0.5
      `).run();
      suspiciousUpdates.push({ check: 'low_gpa_high_sat', affected: suspicious1.changes });

      // Flag impossible SAT scores
      const suspicious2 = db.prepare(`
        UPDATE ml_training_data
        SET confidence_score = 0.1
        WHERE (sat_total < 400 OR sat_total > 1600)
          AND sat_total IS NOT NULL
      `).run();
      suspiciousUpdates.push({ check: 'invalid_sat', affected: suspicious2.changes });

      // Flag impossible ACT scores
      const suspicious3 = db.prepare(`
        UPDATE ml_training_data
        SET confidence_score = 0.1
        WHERE (act_composite < 1 OR act_composite > 36)
          AND act_composite IS NOT NULL
      `).run();
      suspiciousUpdates.push({ check: 'invalid_act', affected: suspicious3.changes });

      logger.info('Data quality check complete:', suspiciousUpdates);

    } catch (error) {
      logger.error('Data quality check failed:', error);
    }
  }

  /**
   * Check for colleges that are now ready for first-time model training
   */
  async checkNewModelsReady() {
    try {
      const isAvailable = await mlPredictionService.isAvailable();
      if (!isAvailable) {
        return;
      }

      const db = dbManager.getDatabase();

      // Find colleges with enough data but no model yet
      const readyColleges = db.prepare(`
        SELECT 
          t.college_id,
          c.name as college_name,
          COUNT(*) as total_samples,
          SUM(CASE WHEN t.decision = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
          SUM(CASE WHEN t.decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count
        FROM ml_training_data t
        LEFT JOIN colleges c ON t.college_id = c.id
        WHERE t.decision IN ('accepted', 'rejected')
        GROUP BY t.college_id
        HAVING total_samples >= 30
          AND accepted_count >= 10
          AND rejected_count >= 10
        ORDER BY total_samples DESC
        LIMIT 10
      `).all();

      let newModelsCreated = 0;

      for (const college of readyColleges) {
        // Check if model already exists
        const exists = await mlPredictionService.modelExists(college.college_id);
        
        if (!exists) {
          // Get training data
          const trainingData = db.prepare(`
            SELECT * FROM ml_training_data
            WHERE college_id = ?
              AND decision IN ('accepted', 'rejected')
          `).all(college.college_id);

          // Train new model
          const result = await mlPredictionService.trainModel(
            college.college_id,
            trainingData,
            false
          );

          if (result.success) {
            newModelsCreated++;
            logger.info(`New ML model created for college ${college.college_id} (${college.college_name})`);

            // Log to training history
            db.prepare(`
              INSERT INTO model_training_history 
              (college_id, model_version, trigger_type, samples_used, accuracy_after, success)
              VALUES (?, ?, 'initial', ?, ?, 1)
            `).run(
              college.college_id,
              result.version || '1.0',
              college.total_samples,
              result.metrics?.accuracy || null
            );
          }
        }
      }

      if (newModelsCreated > 0) {
        logger.info(`Created ${newModelsCreated} new ML models`);
      }

    } catch (error) {
      logger.error('New model check failed:', error);
    }
  }

  /**
   * Get last run statistics
   */
  getLastRunStats() {
    return this.lastRunStats;
  }

  /**
   * Get overall ML system status
   */
  async getSystemStatus() {
    try {
      const db = dbManager.getDatabase();

      // Get data statistics
      const dataStats = db.prepare(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT college_id) as unique_colleges,
          SUM(CASE WHEN decision = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
          SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
          SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified_count,
          AVG(confidence_score) as avg_confidence
        FROM ml_training_data
      `).get();

      // Get model statistics
      const mlStats = await mlPredictionService.getStats();

      // Get recent training history
      const recentTraining = db.prepare(`
        SELECT college_id, model_version, trigger_type, samples_used, accuracy_after, trained_at
        FROM model_training_history
        ORDER BY trained_at DESC
        LIMIT 10
      `).all();

      return {
        dataStatistics: dataStats,
        mlServiceStatus: mlStats,
        recentTraining: recentTraining,
        lastRetrainingRun: this.lastRunStats,
        isRetrainingRunning: this.isRunning
      };

    } catch (error) {
      logger.error('Failed to get ML system status:', error);
      return { error: error.message };
    }
  }
}

const mlRetrainingJob = new MLRetrainingJob();

module.exports = mlRetrainingJob;
