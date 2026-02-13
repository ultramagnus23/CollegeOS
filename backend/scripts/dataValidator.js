/**
 * Data Validation and Quality Control
 * Validates scraped college data against business rules
 */

class DataValidator {
  /**
   * Validate numeric ranges
   */
  static validateNumeric(fieldName, value, min, max) {
    const num = parseFloat(value);
    
    if (isNaN(num)) {
      return { valid: false, error: `${fieldName} must be a number` };
    }
    
    if (num < min || num > max) {
      return { valid: false, error: `${fieldName} must be between ${min} and ${max}, got ${num}` };
    }
    
    return { valid: true };
  }

  /**
   * Validate acceptance rate
   */
  static validateAcceptanceRate(value) {
    return this.validateNumeric('acceptance_rate', value, 0.01, 1.0);
  }

  /**
   * Validate tuition
   */
  static validateTuition(value) {
    return this.validateNumeric('tuition', value, 0, 100000);
  }

  /**
   * Validate GPA
   */
  static validateGPA(value, max = 4.0) {
    return this.validateNumeric('gpa', value, 0.0, max);
  }

  /**
   * Validate student-faculty ratio
   */
  static validateStudentFacultyRatio(value) {
    // Parse ratio like "15:1" or just "15"
    const match = String(value).match(/(\d+)/);
    if (!match) {
      return { valid: false, error: 'Invalid ratio format' };
    }
    return this.validateNumeric('student_faculty_ratio', match[1], 1, 50);
  }

  /**
   * Cross-field validation
   */
  static validateCrossFields(data) {
    const errors = [];

    // Graduation rates: 4yr <= 6yr
    if (data.graduation_rate_4yr && data.graduation_rate_6yr) {
      if (data.graduation_rate_4yr > data.graduation_rate_6yr) {
        errors.push('4-year graduation rate cannot exceed 6-year rate');
      }
    }

    // Salary percentiles: 25th < 50th < 75th
    if (data.salary_25th && data.salary_50th && data.salary_75th) {
      if (data.salary_25th >= data.salary_50th || data.salary_50th >= data.salary_75th) {
        errors.push('Salary percentiles must be in ascending order');
      }
    }

    // Median debt should be less than 4 years of tuition
    if (data.median_debt && data.tuition) {
      if (data.median_debt > data.tuition * 4) {
        errors.push(`Median debt ($${data.median_debt}) exceeds 4 years of tuition - flagged for review`);
      }
    }

    return errors;
  }

  /**
   * Validate application deadlines
   */
  static validateDeadlines(deadlines) {
    if (typeof deadlines !== 'object') {
      return { valid: false, error: 'Deadlines must be an object' };
    }

    const dateFields = ['early_decision_1', 'early_decision_2', 'early_action', 'regular_decision'];
    const dates = {};

    for (const field of dateFields) {
      if (deadlines[field]) {
        const date = new Date(deadlines[field]);
        if (isNaN(date.getTime())) {
          return { valid: false, error: `Invalid date format for ${field}` };
        }
        dates[field] = date;
      }
    }

    // ED1 should come before ED2, which should come before RD
    if (dates.early_decision_1 && dates.early_decision_2) {
      if (dates.early_decision_1 >= dates.early_decision_2) {
        return { valid: false, error: 'ED1 deadline must be before ED2' };
      }
    }
    if (dates.early_decision_2 && dates.regular_decision) {
      if (dates.early_decision_2 >= dates.regular_decision) {
        return { valid: false, error: 'ED2 deadline must be before RD' };
      }
    }

    return { valid: true };
  }

  /**
   * Comprehensive validation for a college record
   */
  static validateRecord(data) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      fieldsValidated: 0
    };

    // Numeric validations
    if (data.acceptance_rate !== undefined && data.acceptance_rate !== null) {
      const result = this.validateAcceptanceRate(data.acceptance_rate);
      results.fieldsValidated++;
      if (!result.valid) results.errors.push(result.error);
    }

    if (data.tuition !== undefined && data.tuition !== null) {
      const result = this.validateTuition(data.tuition);
      results.fieldsValidated++;
      if (!result.valid) results.errors.push(result.error);
    }

    if (data.gpa_50 !== undefined && data.gpa_50 !== null) {
      const result = this.validateGPA(data.gpa_50);
      results.fieldsValidated++;
      if (!result.valid) results.errors.push(result.error);
    }

    // Cross-field validations
    const crossFieldErrors = this.validateCrossFields(data);
    results.errors.push(...crossFieldErrors);

    // Deadline validation
    if (data.application_deadlines) {
      const result = this.validateDeadlines(data.application_deadlines);
      results.fieldsValidated++;
      if (!result.valid) results.errors.push(result.error);
    }

    // Set overall validity
    results.valid = results.errors.length === 0;

    return results;
  }
}

module.exports = DataValidator;
