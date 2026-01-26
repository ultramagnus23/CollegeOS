// backend/services/profileComparisonService.js
// Profile comparison service for chancing breakdown
// 
// HARD CONSTRAINTS (per requirements):
// ❌ No machine learning
// ❌ No acceptance probability predictions
// ❌ No fabricated or guessed numbers
// ❌ No scraping private/gated data
// ❌ No combining metrics into single score
// ✅ All numbers must be sourced, derived, or explicitly marked unavailable
//
// This service compares user academic profiles against SOURCED
// historical admissions data from CDS, Scorecard, and official sources.

const collegeScorecardService = require('./collegeScorecardService');

/**
 * Comparison status labels (calm, explanatory language)
 */
const COMPARISON_STATUS = {
  ABOVE_AVERAGE: 'Above average',
  ABOUT_AVERAGE: 'About average',
  BELOW_AVERAGE: 'Below average',
  DATA_UNAVAILABLE: 'Data unavailable'
};

/**
 * Profile comparison result structure
 */
class ProfileComparisonResult {
  constructor() {
    this.dimensions = [];
    this.overall_context = null;
    this.data_sources = [];
    this.generated_at = new Date().toISOString();
    this.disclaimer = 'This comparison is based on historical admissions data and does not predict admission outcomes. Every application is reviewed holistically.';
  }

  addDimension(dimension) {
    this.dimensions.push(dimension);
  }

  addDataSource(source) {
    if (!this.data_sources.includes(source)) {
      this.data_sources.push(source);
    }
  }
}

/**
 * Single dimension comparison (e.g., GPA, SAT, ACT)
 */
class DimensionComparison {
  constructor(name, userValue, rangeMin, rangeMax, unit = null) {
    this.dimension_name = name;
    this.user_value = userValue;
    this.typical_range = {
      min: rangeMin,
      max: rangeMax
    };
    this.unit = unit;
    this.status = this.calculateStatus();
    this.explanation = this.generateExplanation();
    this.data_available = rangeMin !== null && rangeMax !== null;
  }

  calculateStatus() {
    if (this.typical_range.min === null || this.typical_range.max === null) {
      return COMPARISON_STATUS.DATA_UNAVAILABLE;
    }
    
    if (this.user_value === null || this.user_value === undefined) {
      return COMPARISON_STATUS.DATA_UNAVAILABLE;
    }

    const midpoint = (this.typical_range.min + this.typical_range.max) / 2;
    const range = this.typical_range.max - this.typical_range.min;
    const tolerance = range * 0.1; // 10% tolerance for "about average"

    if (this.user_value >= this.typical_range.max) {
      return COMPARISON_STATUS.ABOVE_AVERAGE;
    } else if (this.user_value >= midpoint - tolerance) {
      return COMPARISON_STATUS.ABOUT_AVERAGE;
    } else {
      return COMPARISON_STATUS.BELOW_AVERAGE;
    }
  }

  generateExplanation() {
    if (this.status === COMPARISON_STATUS.DATA_UNAVAILABLE) {
      return `${this.dimension_name} data is not available for this comparison.`;
    }

    const userStr = this.formatValue(this.user_value);
    const rangeStr = `${this.formatValue(this.typical_range.min)}–${this.formatValue(this.typical_range.max)}`;

    switch (this.status) {
      case COMPARISON_STATUS.ABOVE_AVERAGE:
        return `Your ${this.dimension_name} (${userStr}) is above the typical admitted student range (${rangeStr}).`;
      case COMPARISON_STATUS.ABOUT_AVERAGE:
        return `Your ${this.dimension_name} (${userStr}) is within the typical admitted student range (${rangeStr}).`;
      case COMPARISON_STATUS.BELOW_AVERAGE:
        return `Your ${this.dimension_name} (${userStr}) is below the typical admitted student range (${rangeStr}).`;
      default:
        return '';
    }
  }

  formatValue(value) {
    if (value === null || value === undefined) return 'N/A';
    if (this.unit === 'gpa') return value.toFixed(2);
    if (this.unit === 'percentage') return `${(value * 100).toFixed(0)}%`;
    return value.toString();
  }
}

class ProfileComparisonService {
  /**
   * Compare user profile against a college's historical admissions data
   * 
   * @param {object} userProfile - User's academic profile
   * @param {object} collegeData - College admissions data (from Scorecard or CDS)
   * @returns {ProfileComparisonResult} - Structured comparison result
   */
  compareProfile(userProfile, collegeData) {
    const result = new ProfileComparisonResult();

    // Validate inputs
    if (!userProfile) {
      throw new Error('User profile is required');
    }
    if (!collegeData) {
      throw new Error('College data is required');
    }

    // Add data sources
    if (collegeData.admissions_stats?.data_source) {
      result.addDataSource(collegeData.admissions_stats.data_source);
    }

    // Compare GPA (if available)
    if (userProfile.gpa !== undefined) {
      // Note: College Scorecard doesn't provide GPA ranges
      // This would need to come from CDS or other sources
      const gpaComparison = this.compareGPA(userProfile.gpa, collegeData);
      result.addDimension(gpaComparison);
    }

    // Compare SAT scores (if available)
    if (userProfile.sat_total !== undefined || userProfile.sat_math !== undefined) {
      const satComparison = this.compareSAT(userProfile, collegeData);
      satComparison.forEach(dim => result.addDimension(dim));
    }

    // Compare ACT scores (if available)
    if (userProfile.act_composite !== undefined) {
      const actComparison = this.compareACT(userProfile.act_composite, collegeData);
      result.addDimension(actComparison);
    }

    // Add overall context (non-predictive)
    result.overall_context = this.generateOverallContext(result.dimensions);

    return result;
  }

  /**
   * Compare GPA against typical admitted students
   * Note: Scorecard doesn't provide GPA data - requires CDS
   */
  compareGPA(userGPA, collegeData) {
    // Check if we have GPA data from CDS or other sources
    const gpaData = collegeData.gpa_stats || collegeData.cds_data?.gpa;
    
    if (gpaData && gpaData.range_25 !== undefined && gpaData.range_75 !== undefined) {
      return new DimensionComparison(
        'GPA',
        userGPA,
        gpaData.range_25,
        gpaData.range_75,
        'gpa'
      );
    }

    // If no GPA data available, return with null ranges
    return new DimensionComparison('GPA', userGPA, null, null, 'gpa');
  }

  /**
   * Compare SAT scores against typical admitted students
   * Uses 25th-75th percentile ranges from Scorecard
   */
  compareSAT(userProfile, collegeData) {
    const dimensions = [];
    const stats = collegeData.admissions_stats || {};

    // SAT Math
    if (userProfile.sat_math !== undefined) {
      dimensions.push(new DimensionComparison(
        'SAT Math',
        userProfile.sat_math,
        stats.sat_math_25,
        stats.sat_math_75,
        null
      ));
    }

    // SAT Reading/Evidence-Based
    if (userProfile.sat_reading !== undefined) {
      dimensions.push(new DimensionComparison(
        'SAT Reading',
        userProfile.sat_reading,
        stats.sat_reading_25,
        stats.sat_reading_75,
        null
      ));
    }

    // SAT Total (if both sections available)
    if (userProfile.sat_total !== undefined) {
      const total25 = (stats.sat_math_25 && stats.sat_reading_25) 
        ? stats.sat_math_25 + stats.sat_reading_25 
        : null;
      const total75 = (stats.sat_math_75 && stats.sat_reading_75)
        ? stats.sat_math_75 + stats.sat_reading_75
        : null;

      dimensions.push(new DimensionComparison(
        'SAT Total',
        userProfile.sat_total,
        total25,
        total75,
        null
      ));
    }

    return dimensions;
  }

  /**
   * Compare ACT score against typical admitted students
   */
  compareACT(userACT, collegeData) {
    const stats = collegeData.admissions_stats || {};

    return new DimensionComparison(
      'ACT Composite',
      userACT,
      stats.act_25,
      stats.act_75,
      null
    );
  }

  /**
   * Generate overall context (NOT a prediction or probability)
   */
  generateOverallContext(dimensions) {
    const available = dimensions.filter(d => d.data_available);
    
    if (available.length === 0) {
      return 'Insufficient data is available to compare your profile with typical admitted students at this institution.';
    }

    const above = available.filter(d => d.status === COMPARISON_STATUS.ABOVE_AVERAGE).length;
    const about = available.filter(d => d.status === COMPARISON_STATUS.ABOUT_AVERAGE).length;
    const below = available.filter(d => d.status === COMPARISON_STATUS.BELOW_AVERAGE).length;

    if (above === available.length) {
      return 'Your academic metrics are above the typical range for admitted students across all available dimensions. Remember that admissions decisions consider many factors beyond test scores.';
    }
    
    if (below === available.length) {
      return 'Your academic metrics are below the typical range for admitted students. Many factors influence admissions decisions, and strong essays, recommendations, and extracurriculars can strengthen your application.';
    }

    if (above > below) {
      return 'Your academic metrics compare favorably to typical admitted students on most dimensions. Admissions decisions are holistic and consider many factors.';
    }

    if (below > above) {
      return 'Your academic metrics are below average on some dimensions. Consider emphasizing other strengths in your application, such as leadership, unique experiences, or strong essays.';
    }

    return 'Your academic metrics are generally in line with typical admitted students. Focus on presenting a well-rounded application.';
  }

  /**
   * Get comparison for a specific college by name
   * Fetches data from Scorecard API and compares
   */
  async getCollegeComparison(userProfile, collegeName) {
    // Fetch college data from Scorecard
    const collegeData = await collegeScorecardService.searchByName(collegeName);
    
    if (!collegeData) {
      return {
        success: false,
        error: `Could not find data for "${collegeName}" in College Scorecard database.`,
        suggestion: 'Try searching with the full official name of the institution.'
      };
    }

    try {
      const comparison = this.compareProfile(userProfile, collegeData);
      
      return {
        success: true,
        college_name: collegeData.name,
        college_location: `${collegeData.city}, ${collegeData.state}`,
        comparison: comparison,
        college_info: {
          acceptance_rate: collegeData.admissions_stats?.acceptance_rate,
          type: collegeData.type,
          website: collegeData.official_website
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new ProfileComparisonService();
module.exports.ProfileComparisonService = ProfileComparisonService;
module.exports.COMPARISON_STATUS = COMPARISON_STATUS;
