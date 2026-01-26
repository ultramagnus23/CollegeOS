// backend/services/collegeScorecardService.js
// Service for fetching data from the US College Scorecard API
// API Documentation: https://collegescorecard.ed.gov/data/documentation/
// 
// IMPORTANT: This service only provides sourced, verified data
// No fabrication, no ML, no probability predictions

const axios = require('axios');

// College Scorecard API configuration
// Note: The API is free but rate-limited
const SCORECARD_API_BASE = 'https://api.data.gov/ed/collegescorecard/v1';

// Common fields to fetch from Scorecard API
// See: https://collegescorecard.ed.gov/data/documentation/
const SCORECARD_FIELDS = [
  // Basic info
  'id',
  'school.name',
  'school.city',
  'school.state',
  'school.school_url',
  'school.price_calculator_url',
  'school.ownership', // 1=Public, 2=Private nonprofit, 3=Private for-profit
  'school.locale',
  'school.carnegie_basic',
  
  // Admissions
  'latest.admissions.admission_rate.overall',
  'latest.admissions.sat_scores.25th_percentile.critical_reading',
  'latest.admissions.sat_scores.75th_percentile.critical_reading',
  'latest.admissions.sat_scores.25th_percentile.math',
  'latest.admissions.sat_scores.75th_percentile.math',
  'latest.admissions.sat_scores.midpoint.critical_reading',
  'latest.admissions.sat_scores.midpoint.math',
  'latest.admissions.act_scores.25th_percentile.cumulative',
  'latest.admissions.act_scores.75th_percentile.cumulative',
  'latest.admissions.act_scores.midpoint.cumulative',
  
  // Cost
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.cost.avg_net_price.overall',
  'latest.cost.attendance.academic_year',
  
  // Student body
  'latest.student.size',
  'latest.student.enrollment.undergrad_12_month',
  'latest.student.demographics.race_ethnicity.white',
  'latest.student.demographics.race_ethnicity.black',
  'latest.student.demographics.race_ethnicity.hispanic',
  'latest.student.demographics.race_ethnicity.asian',
  
  // Academics
  'latest.academics.program_percentage.computer',
  'latest.academics.program_percentage.engineering',
  'latest.academics.program_percentage.business_marketing',
  'latest.academics.program_percentage.biological',
  
  // Outcomes
  'latest.completion.rate_suppressed.overall',
  'latest.earnings.10_yrs_after_entry.median'
];

class CollegeScorecardService {
  constructor(apiKey = null) {
    // API key is optional but recommended for higher rate limits
    // Get a free key at: https://api.data.gov/signup/
    this.apiKey = apiKey || process.env.SCORECARD_API_KEY || null;
  }

  /**
   * Build API request URL
   * @param {object} params - Query parameters
   * @returns {string} - Full API URL
   */
  buildUrl(endpoint, params = {}) {
    const url = new URL(`${SCORECARD_API_BASE}${endpoint}`);
    
    // Add API key if available
    if (this.apiKey) {
      url.searchParams.append('api_key', this.apiKey);
    }
    
    // Add other parameters
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
    return url.toString();
  }

  /**
   * Fetch college data by name search
   * @param {string} name - College name to search
   * @returns {object} - College data from Scorecard API
   */
  async searchByName(name) {
    try {
      const url = this.buildUrl('/schools.json', {
        'school.name': name,
        'fields': SCORECARD_FIELDS.join(','),
        'per_page': 10
      });

      console.log(`📊 Fetching from College Scorecard: ${name}`);
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        return this.normalizeCollegeData(response.data.results[0]);
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Scorecard API error for "${name}":`, error.message);
      return null;
    }
  }

  /**
   * Fetch college data by OPEID (federal ID)
   * @param {string} opeid - OPEID of the college
   * @returns {object} - College data
   */
  async getByOpeid(opeid) {
    try {
      const url = this.buildUrl('/schools.json', {
        'id': opeid,
        'fields': SCORECARD_FIELDS.join(',')
      });

      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        return this.normalizeCollegeData(response.data.results[0]);
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Scorecard API error for OPEID ${opeid}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch multiple colleges by state
   * @param {string} state - Two-letter state code
   * @param {number} limit - Max results
   * @returns {array} - Array of college data
   */
  async getByState(state, limit = 100) {
    try {
      const url = this.buildUrl('/schools.json', {
        'school.state': state,
        'fields': SCORECARD_FIELDS.join(','),
        'per_page': limit
      });

      const response = await axios.get(url, { timeout: 15000 });
      
      if (response.data && response.data.results) {
        return response.data.results.map(r => this.normalizeCollegeData(r));
      }
      
      return [];
    } catch (error) {
      console.error(`❌ Scorecard API error for state ${state}:`, error.message);
      return [];
    }
  }

  /**
   * Normalize Scorecard API response to our schema
   * @param {object} raw - Raw API response
   * @returns {object} - Normalized college data
   */
  normalizeCollegeData(raw) {
    // Helper to safely get nested property
    const get = (obj, path, defaultVal = null) => {
      return path.split('.').reduce((o, key) => (o && o[key] !== undefined) ? o[key] : defaultVal, obj);
    };

    // Map ownership codes to types
    const ownershipMap = {
      1: 'Public',
      2: 'Private Non-Profit',
      3: 'Private For-Profit'
    };

    return {
      // Source identification
      source: 'college_scorecard',
      source_id: get(raw, 'id'),
      
      // Basic info
      name: get(raw, 'school.name'),
      city: get(raw, 'school.city'),
      state: get(raw, 'school.state'),
      country: 'US',
      official_website: get(raw, 'school.school_url'),
      type: ownershipMap[get(raw, 'school.ownership')] || null,
      
      // Admissions statistics (SOURCED DATA - NOT FABRICATED)
      admissions_stats: {
        acceptance_rate: get(raw, 'latest.admissions.admission_rate.overall'),
        sat_reading_25: get(raw, 'latest.admissions.sat_scores.25th_percentile.critical_reading'),
        sat_reading_75: get(raw, 'latest.admissions.sat_scores.75th_percentile.critical_reading'),
        sat_reading_mid: get(raw, 'latest.admissions.sat_scores.midpoint.critical_reading'),
        sat_math_25: get(raw, 'latest.admissions.sat_scores.25th_percentile.math'),
        sat_math_75: get(raw, 'latest.admissions.sat_scores.75th_percentile.math'),
        sat_math_mid: get(raw, 'latest.admissions.sat_scores.midpoint.math'),
        act_25: get(raw, 'latest.admissions.act_scores.25th_percentile.cumulative'),
        act_75: get(raw, 'latest.admissions.act_scores.75th_percentile.cumulative'),
        act_mid: get(raw, 'latest.admissions.act_scores.midpoint.cumulative'),
        data_source: 'US Department of Education College Scorecard',
        data_year: new Date().getFullYear() - 1 // Data is typically 1 year behind
      },
      
      // Cost data (SOURCED DATA)
      cost: {
        in_state_tuition: get(raw, 'latest.cost.tuition.in_state'),
        out_of_state_tuition: get(raw, 'latest.cost.tuition.out_of_state'),
        avg_net_price: get(raw, 'latest.cost.avg_net_price.overall'),
        total_attendance_cost: get(raw, 'latest.cost.attendance.academic_year'),
        currency: 'USD',
        data_source: 'US Department of Education College Scorecard'
      },
      
      // Student body
      student_body: {
        total_size: get(raw, 'latest.student.size'),
        undergrad_enrollment: get(raw, 'latest.student.enrollment.undergrad_12_month'),
        data_source: 'US Department of Education College Scorecard'
      },
      
      // Outcomes (SOURCED DATA)
      outcomes: {
        graduation_rate: get(raw, 'latest.completion.rate_suppressed.overall'),
        median_earnings_10yr: get(raw, 'latest.earnings.10_yrs_after_entry.median'),
        data_source: 'US Department of Education College Scorecard'
      },
      
      // Metadata
      fetched_at: new Date().toISOString(),
      trust_tier: 'official_government'
    };
  }

  /**
   * Fetch ALL US colleges with pagination
   * This can take several minutes due to API rate limiting
   * @param {object} options - Fetch options
   * @returns {array} - Array of all college data
   */
  async fetchAllColleges(options = {}) {
    const {
      pageSize = 100,
      maxPages = 100, // Safety limit: 100 pages = 10,000 colleges max
      filters = { 'school.operating': 1 },
      onProgress = null
    } = options;

    const allResults = [];
    let page = 0;
    let hasMore = true;
    
    console.log('📊 Fetching all US colleges from College Scorecard...');
    
    try {
      while (hasMore && page < maxPages) {
        const params = {
          'fields': SCORECARD_FIELDS.join(','),
          'per_page': pageSize,
          'page': page,
          ...filters
        };
        
        const url = this.buildUrl('/schools.json', params);
        const response = await axios.get(url, { timeout: 60000 });
        
        if (!response.data || !response.data.results || response.data.results.length === 0) {
          hasMore = false;
          break;
        }
        
        const pageResults = response.data.results.map(r => this.normalizeCollegeData(r));
        allResults.push(...pageResults);
        
        // Progress callback
        if (onProgress) {
          onProgress({
            page,
            fetched: allResults.length,
            total: response.data.metadata?.total || null
          });
        }
        
        // Check if there are more pages
        const metadata = response.data.metadata;
        if (metadata && metadata.total) {
          hasMore = (page + 1) * pageSize < metadata.total;
        } else {
          hasMore = response.data.results.length === pageSize;
        }
        
        page++;
        
        // Rate limiting: 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`📊 Fetched ${allResults.length} US colleges from College Scorecard`);
      return allResults;
      
    } catch (error) {
      console.error(`❌ Error fetching all colleges:`, error.message);
      // Return what we have so far
      return allResults;
    }
  }

  /**
   * Check if API is accessible
   * @returns {boolean} - API availability status
   */
  async checkHealth() {
    try {
      const url = this.buildUrl('/schools.json', {
        'school.name': 'Harvard',
        'fields': 'school.name',
        'per_page': 1
      });
      
      const response = await axios.get(url, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      console.error('❌ Scorecard API health check failed:', error.message);
      return false;
    }
  }
}

module.exports = new CollegeScorecardService();
module.exports.CollegeScorecardService = CollegeScorecardService;
