// backend/src/services/mlPredictionService.js
// Node.js service for integrating with the Python ML prediction service

const axios = require('axios');
const logger = require('../utils/logger');

// ML service configuration
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5050';
const ML_SERVICE_TIMEOUT = parseInt(process.env.ML_SERVICE_TIMEOUT || '10000', 10);

class MLPredictionService {
  constructor() {
    this.client = axios.create({
      baseURL: ML_SERVICE_URL,
      timeout: ML_SERVICE_TIMEOUT,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    this.serviceAvailable = null;
    this.lastHealthCheck = null;
  }

  /**
   * Check if ML service is available
   */
  async isAvailable() {
    // Cache health check for 60 seconds
    if (this.lastHealthCheck && Date.now() - this.lastHealthCheck < 60000) {
      return this.serviceAvailable;
    }

    try {
      const response = await this.client.get('/health');
      this.serviceAvailable = response.status === 200;
      this.lastHealthCheck = Date.now();
      return this.serviceAvailable;
    } catch (error) {
      this.serviceAvailable = false;
      this.lastHealthCheck = Date.now();
      logger.debug('ML service not available:', error.message);
      return false;
    }
  }

  /**
   * Format student profile for ML prediction
   */
  formatStudentProfile(profile, activities = []) {
    // Count activities by tier
    const tier1Count = activities.filter(a => a.tier_rating === 1).length;
    const tier2Count = activities.filter(a => a.tier_rating === 2).length;
    const tier3Count = activities.filter(a => a.tier_rating === 3 || a.tier_rating === 4).length;

    return {
      gpa_unweighted: profile.gpa_unweighted,
      gpa_weighted: profile.gpa_weighted,
      gpa_scale: profile.gpa_scale || '4.0',
      sat_total: profile.sat_total,
      act_composite: profile.act_composite,
      class_rank_percentile: profile.class_rank_percentile,
      num_ap_courses: profile.num_ap_courses || 0,
      num_ib_courses: profile.num_ib_courses || 0,
      activity_tier1_count: tier1Count,
      activity_tier2_count: tier2Count,
      activity_tier3_count: tier3Count,
      is_first_generation: profile.is_first_generation || false,
      is_legacy: profile.is_legacy || false,
      is_athlete: profile.is_athlete || false,
      state_province: profile.state_province
    };
  }

  /**
   * Format college for ML prediction
   */
  formatCollege(college) {
    return {
      id: college.id,
      name: college.name,
      acceptance_rate: college.acceptance_rate,
      average_gpa: college.average_gpa,
      location_state: college.location_state || college.state,
      sat_total_25th: college.sat_total_25th,
      sat_total_75th: college.sat_total_75th
    };
  }

  /**
   * Get ML prediction for a student at a specific college
   */
  async predict(studentProfile, activities, college) {
    // Check service availability
    const available = await this.isAvailable();
    
    if (!available) {
      return {
        success: false,
        prediction_type: 'unavailable',
        message: 'ML prediction service is not available'
      };
    }

    try {
      const response = await this.client.post('/api/predict', {
        student_profile: this.formatStudentProfile(studentProfile, activities),
        college: this.formatCollege(college)
      });

      return response.data;
    } catch (error) {
      logger.error('ML prediction failed:', error.message);
      return {
        success: false,
        prediction_type: 'error',
        message: error.message
      };
    }
  }

  /**
   * Get ML predictions for multiple colleges
   */
  async batchPredict(studentProfile, activities, colleges) {
    const available = await this.isAvailable();
    
    if (!available) {
      return {
        success: false,
        prediction_type: 'unavailable',
        message: 'ML prediction service is not available',
        predictions: []
      };
    }

    try {
      const response = await this.client.post('/api/predict/batch', {
        student_profile: this.formatStudentProfile(studentProfile, activities),
        colleges: colleges.map(c => this.formatCollege(c))
      });

      return response.data;
    } catch (error) {
      logger.error('ML batch prediction failed:', error.message);
      return {
        success: false,
        prediction_type: 'error',
        message: error.message,
        predictions: []
      };
    }
  }

  /**
   * Check if a model exists for a specific college
   */
  async modelExists(collegeId) {
    const available = await this.isAvailable();
    if (!available) return false;

    try {
      const response = await this.client.get(`/api/models/${collegeId}`);
      return response.data.success === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get model information for a college
   */
  async getModelInfo(collegeId) {
    const available = await this.isAvailable();
    if (!available) return null;

    try {
      const response = await this.client.get(`/api/models/${collegeId}`);
      return response.data.success ? response.data.model : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get list of all trained models
   */
  async listModels() {
    const available = await this.isAvailable();
    if (!available) return [];

    try {
      const response = await this.client.get('/api/models');
      return response.data.success ? response.data.models : [];
    } catch (error) {
      logger.error('Failed to list ML models:', error.message);
      return [];
    }
  }

  /**
   * Get ML service statistics
   */
  async getStats() {
    const available = await this.isAvailable();
    if (!available) {
      return { available: false };
    }

    try {
      const response = await this.client.get('/api/stats');
      return {
        available: true,
        ...response.data
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  /**
   * Trigger model training for a college
   */
  async trainModel(collegeId, trainingData, force = false) {
    const available = await this.isAvailable();
    if (!available) {
      return { success: false, message: 'ML service not available' };
    }

    try {
      const response = await this.client.post('/api/train', {
        college_id: collegeId,
        training_data: trainingData,
        force: force
      });
      return response.data;
    } catch (error) {
      logger.error('Model training request failed:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Check if college has enough data for training
   */
  async checkTrainingReadiness(collegeId, trainingData) {
    const available = await this.isAvailable();
    if (!available) {
      return { success: false, is_ready: false, message: 'ML service not available' };
    }

    try {
      const response = await this.client.post('/api/models/check-readiness', {
        college_id: collegeId,
        training_data: trainingData
      });
      return response.data;
    } catch (error) {
      return { success: false, is_ready: false, message: error.message };
    }
  }

  /**
   * Clear model cache
   */
  async clearCache(collegeId = null) {
    const available = await this.isAvailable();
    if (!available) return false;

    try {
      await this.client.post('/api/cache/clear', 
        collegeId ? { college_id: collegeId } : {}
      );
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
const mlPredictionService = new MLPredictionService();

module.exports = mlPredictionService;
