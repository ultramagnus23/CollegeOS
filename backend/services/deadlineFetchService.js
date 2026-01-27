// backend/services/deadlineFetchService.js
// Service to automatically fetch/provide deadline templates for colleges
// Uses stored deadline templates and official source data

const dbManager = require('../src/config/database');
const College = require('../src/models/College');
const logger = require('../src/utils/logger');

// Known deadline templates for common application portals and countries
// This is verified data from official sources
const DEADLINE_TEMPLATES = {
  // US Regular Decision deadlines (most common)
  'US_REGULAR': {
    regular_decision: { month: 1, day: 1, label: 'Regular Decision' },
    early_decision: { month: 11, day: 1, label: 'Early Decision' },
    early_action: { month: 11, day: 1, label: 'Early Action' },
    early_decision_2: { month: 1, day: 1, label: 'Early Decision II' }
  },
  // UK UCAS deadlines
  'UK_UCAS': {
    oxford_cambridge: { month: 10, day: 15, label: 'Oxford/Cambridge Deadline' },
    medicine: { month: 10, day: 15, label: 'Medicine/Veterinary Deadline' },
    regular: { month: 1, day: 31, label: 'UCAS Regular Deadline' },
    late: { month: 6, day: 30, label: 'UCAS Late Applications' }
  },
  // Indian universities (various)
  'INDIA_JEE': {
    jee_mains: { month: 4, day: null, label: 'JEE Mains Exam' },
    jee_advanced: { month: 5, day: null, label: 'JEE Advanced Exam' },
    josaa_counseling: { month: 6, day: null, label: 'JoSAA Counseling' }
  },
  'INDIA_NEET': {
    neet: { month: 5, day: null, label: 'NEET Exam' },
    counseling: { month: 7, day: null, label: 'NEET Counseling' }
  },
  // EU - Netherlands
  'NL_STUDIELINK': {
    numerus_fixus: { month: 1, day: 15, label: 'Numerus Fixus Deadline' },
    regular: { month: 5, day: 1, label: 'Regular Deadline' }
  },
  // EU - Germany
  'DE_REGULAR': {
    winter_semester: { month: 7, day: 15, label: 'Winter Semester Application' },
    summer_semester: { month: 1, day: 15, label: 'Summer Semester Application' }
  }
};

// Known college-specific deadline data (from official sources)
// This is a curated subset - would be expanded over time
const COLLEGE_DEADLINES = {
  // Ivy League + Top US
  'Harvard University': {
    regular_decision: '2025-01-01',
    early_action: '2024-11-01',
    test_optional: true,
    source: 'Official Harvard Admissions'
  },
  'Yale University': {
    regular_decision: '2025-01-02',
    early_action: '2024-11-01',
    test_optional: true,
    source: 'Official Yale Admissions'
  },
  'Princeton University': {
    regular_decision: '2025-01-01',
    early_action: '2024-11-01',
    test_optional: false, // Princeton reinstated testing requirements
    source: 'Official Princeton Admissions'
  },
  'Stanford University': {
    regular_decision: '2025-01-02',
    early_action: '2024-11-01',
    test_optional: true,
    source: 'Official Stanford Admissions'
  },
  'Massachusetts Institute of Technology': {
    regular_decision: '2025-01-04',
    early_action: '2024-11-01',
    test_optional: false, // MIT requires tests
    source: 'Official MIT Admissions'
  },
  'Columbia University': {
    regular_decision: '2025-01-01',
    early_decision: '2024-11-01',
    test_optional: true,
    source: 'Official Columbia Admissions'
  },
  'University of Pennsylvania': {
    regular_decision: '2025-01-05',
    early_decision: '2024-11-01',
    test_optional: true,
    source: 'Official Penn Admissions'
  },
  'Cornell University': {
    regular_decision: '2025-01-02',
    early_decision: '2024-11-01',
    test_optional: true,
    source: 'Official Cornell Admissions'
  },
  'Brown University': {
    regular_decision: '2025-01-05',
    early_decision: '2024-11-01',
    test_optional: true,
    source: 'Official Brown Admissions'
  },
  'Dartmouth College': {
    regular_decision: '2025-01-02',
    early_decision: '2024-11-01',
    test_optional: false, // Dartmouth reinstated testing
    source: 'Official Dartmouth Admissions'
  },
  'Duke University': {
    regular_decision: '2025-01-04',
    early_decision: '2024-11-01',
    test_optional: true,
    source: 'Official Duke Admissions'
  },
  
  // UK Top Universities
  'University of Oxford': {
    deadline: '2024-10-15',
    deadline_type: 'oxford_cambridge',
    source: 'UCAS',
    notes: 'All Oxford applicants must apply by October 15'
  },
  'University of Cambridge': {
    deadline: '2024-10-15',
    deadline_type: 'oxford_cambridge',
    source: 'UCAS',
    notes: 'All Cambridge applicants must apply by October 15'
  },
  'Imperial College London': {
    deadline: '2025-01-31',
    deadline_type: 'regular',
    source: 'UCAS'
  },
  'London School of Economics and Political Science': {
    deadline: '2025-01-31',
    deadline_type: 'regular',
    source: 'UCAS'
  },
  'University College London': {
    deadline: '2025-01-31',
    deadline_type: 'regular',
    source: 'UCAS'
  }
};

class DeadlineFetchService {
  
  /**
   * Get deadline information for a college
   * @param {number|object} collegeOrId - College ID or college object
   * @returns {object} Deadline information
   */
  async getDeadlinesForCollege(collegeOrId) {
    let college;
    
    if (typeof collegeOrId === 'number') {
      college = College.findById(collegeOrId);
    } else {
      college = collegeOrId;
    }
    
    if (!college) {
      throw new Error('College not found');
    }
    
    const result = {
      collegeName: college.name,
      country: college.country,
      deadlines: [],
      source: null,
      notes: null
    };
    
    // 1. Check if we have specific deadline data for this college
    const specificData = COLLEGE_DEADLINES[college.name];
    if (specificData) {
      result.source = specificData.source;
      result.notes = specificData.notes;
      
      if (specificData.regular_decision) {
        result.deadlines.push({
          type: 'regular_decision',
          label: 'Regular Decision',
          date: specificData.regular_decision,
          isRequired: true
        });
      }
      if (specificData.early_decision) {
        result.deadlines.push({
          type: 'early_decision',
          label: 'Early Decision',
          date: specificData.early_decision,
          isBinding: true
        });
      }
      if (specificData.early_action) {
        result.deadlines.push({
          type: 'early_action',
          label: 'Early Action',
          date: specificData.early_action,
          isBinding: false
        });
      }
      if (specificData.deadline) {
        result.deadlines.push({
          type: specificData.deadline_type || 'regular',
          label: specificData.deadline_type === 'oxford_cambridge' ? 'UCAS Deadline (Oxford/Cambridge)' : 'Application Deadline',
          date: specificData.deadline
        });
      }
      
      return result;
    }
    
    // 2. Use country-based templates
    if (college.country === 'US') {
      const template = DEADLINE_TEMPLATES['US_REGULAR'];
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      
      result.source = 'Common Application Typical Deadlines';
      result.deadlines = [
        {
          type: 'regular_decision',
          label: 'Regular Decision (Typical)',
          date: `${nextYear}-01-01`,
          isEstimate: true
        },
        {
          type: 'early_action',
          label: 'Early Action (Typical)',
          date: `${currentYear}-11-01`,
          isEstimate: true
        },
        {
          type: 'early_decision',
          label: 'Early Decision (Typical)',
          date: `${currentYear}-11-01`,
          isEstimate: true,
          isBinding: true
        }
      ];
      result.notes = 'These are typical deadlines. Please verify on the official website.';
    } else if (college.country === 'UK') {
      const template = DEADLINE_TEMPLATES['UK_UCAS'];
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      
      result.source = 'UCAS';
      result.deadlines = [
        {
          type: 'regular',
          label: 'UCAS Deadline',
          date: `${nextYear}-01-31`,
          isEstimate: false
        }
      ];
      result.notes = 'UK universities use UCAS for undergraduate applications.';
    } else if (college.country === 'IN') {
      result.source = 'Indian Higher Education';
      result.deadlines = [
        {
          type: 'entrance_exam',
          label: 'Entrance Exam Period',
          dateRange: 'April - June',
          isEstimate: true
        },
        {
          type: 'counseling',
          label: 'Counseling Period',
          dateRange: 'June - August',
          isEstimate: true
        }
      ];
      result.notes = 'Indian universities use entrance exams (JEE, NEET, etc.) for admissions.';
    } else if (college.country === 'DE') {
      const template = DEADLINE_TEMPLATES['DE_REGULAR'];
      result.source = 'German University Admissions';
      result.deadlines = [
        {
          type: 'winter',
          label: 'Winter Semester',
          date: '2025-07-15',
          isEstimate: true
        },
        {
          type: 'summer',
          label: 'Summer Semester',
          date: '2025-01-15',
          isEstimate: true
        }
      ];
      result.notes = 'German universities have semester-based application deadlines.';
    } else if (college.country === 'NL') {
      result.source = 'Studielink';
      result.deadlines = [
        {
          type: 'regular',
          label: 'Regular Deadline',
          date: '2025-05-01',
          isEstimate: true
        }
      ];
      result.notes = 'Netherlands uses Studielink for applications.';
    } else {
      result.notes = 'Please check the official university website for deadline information.';
    }
    
    return result;
  }
  
  /**
   * Create deadline records for an application based on college deadlines
   * @param {number} applicationId - Application ID
   * @param {number} collegeId - College ID
   * @param {string[]} selectedTypes - Which deadline types the user wants (e.g., ['regular_decision', 'early_action'])
   */
  async createDeadlinesForApplication(applicationId, collegeId, selectedTypes = []) {
    const deadlineInfo = await this.getDeadlinesForCollege(collegeId);
    
    // Get database connection - will throw if database is not initialized
    let db;
    try {
      db = dbManager.getDatabase();
    } catch (error) {
      logger.error('Failed to get database connection:', error);
      throw new Error('Database connection is not available: ' + error.message);
    }
    
    if (!db) {
      throw new Error('Database connection is not available');
    }
    
    const insertStmt = db.prepare(`
      INSERT INTO deadlines (application_id, deadline_type, deadline_date, description, source_url)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const createdDeadlines = [];
    
    for (const deadline of deadlineInfo.deadlines) {
      // If selectedTypes is empty, include all. Otherwise only include selected types.
      if (selectedTypes.length === 0 || selectedTypes.includes(deadline.type)) {
        // Only insert if we have a date
        if (deadline.date) {
          try {
            const result = insertStmt.run(
              applicationId,
              deadline.type,
              deadline.date,
              `${deadline.label}${deadline.isEstimate ? ' (Estimated)' : ''}`,
              deadlineInfo.source || null
            );
            
            createdDeadlines.push({
              id: result.lastInsertRowid,
              type: deadline.type,
              label: deadline.label,
              date: deadline.date
            });
          } catch (error) {
            logger.error(`Failed to create deadline: ${error.message}`);
          }
        }
      }
    }
    
    return {
      applicationId,
      createdDeadlines,
      source: deadlineInfo.source,
      notes: deadlineInfo.notes
    };
  }
  
  /**
   * Get all deadline templates
   */
  getTemplates() {
    return DEADLINE_TEMPLATES;
  }
}

module.exports = new DeadlineFetchService();
